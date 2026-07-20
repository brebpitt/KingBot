import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import { 
    parseDuration, 
    validatePrize, 
    validateWinnerCount,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import { botConfig } from '../../config/bot.js';

const GIVEAWAY_MIN_WINNERS = botConfig.giveaways?.minimumWinners ?? 1;
const GIVEAWAY_MAX_WINNERS = botConfig.giveaways?.maximumWinners ?? 10;

export default {
    data: new SlashCommandBuilder()
        .setName("розыгрыш")
        .setDescription("🎉 Запускает новый розыгрыш в указанном канале.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription(
                    "Как долго должен длиться розыгрыш (например, 1ч, 30м, 5д).",
                )
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("Количество победителей.")
                .setMinValue(GIVEAWAY_MIN_WINNERS)
                .setMaxValue(GIVEAWAY_MAX_WINNERS)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("Приз, который розыгрывается.")
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("Канал для отправки розыгрыша (по умолчанию текущий канал).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // Отложенный ответ: отправка сообщения о розыгрыше + запись в БД могут превысить 3-секундное окно
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Команда розыгрыша использована вне гильдии',
                ErrorTypes.VALIDATION,
                'Эту команду можно использовать только на сервере.',
                { userId: interaction.user.id }
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'У пользователя нет разрешения ManageGuild',
                ErrorTypes.PERMISSION,
                "Вам нужно разрешение 'Управлять сервером' для запуска розыгрыша.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Создание розыгрыша начато пользователем ${interaction.user.tag} на сервере ${interaction.guildId}`);

        const durationString = interaction.options.getString("duration");
        const winnerCount = interaction.options.getInteger("winners");
        const prize = interaction.options.getString("prize");
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

        const durationMs = parseDuration(durationString);
        validateWinnerCount(winnerCount);
        const prizeName = validatePrize(prize);

        if (!targetChannel.isTextBased()) {
            throw new TitanBotError(
                'Целевой канал не является текстовым',
                ErrorTypes.VALIDATION,
                'Канал должен быть текстовым.',
                { channelId: targetChannel.id, channelType: targetChannel.type }
            );
        }

        const endTime = Date.now() + durationMs;

        const initialGiveawayData = {
            messageId: "placeholder",
            channelId: targetChannel.id,
            guildId: interaction.guildId,
            prize: prizeName,
            hostId: interaction.user.id,
            endTime: endTime,
            endsAt: endTime,
            winnerCount: winnerCount,
            participants: [],
            isEnded: false,
            ended: false,
            createdAt: new Date().toISOString()
        };

        const embed = createGiveawayEmbed(initialGiveawayData, "active");
        const row = createGiveawayButtons(false);

        const giveawayMessage = await targetChannel.send({
            content: "<@&1526907361313165412>",
            embeds: [embed],
            components: [row],
        });

        initialGiveawayData.messageId = giveawayMessage.id;
        const saved = await saveGiveaway(
            interaction.client,
            interaction.guildId,
            initialGiveawayData,
        );

        if (!saved) {
            logger.warn(`Не удалось сохранить розыгрыш в базу данных: ${giveawayMessage.id}`);
        }

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                data: {
                    description: `Розыгрыш создан: ${prizeName}`,
                    channelId: targetChannel.id,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Приз',
                            value: prizeName,
                            inline: true
                        },
                        {
                            name: 'Победители',
                            value: winnerCount.toString(),
                            inline: true
                        },
                        {
                            name: 'Длительность',
                            value: durationString,
                            inline: true
                        },
                        {
                            name: 'Канал',
                            value: targetChannel.toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Ошибка при логировании события создания розыгрыша:', logError);
        }

        logger.info(`Розыгрыш успешно создан: ${giveawayMessage.id} в канале ${targetChannel.name}`);

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    `Розыгрыш запущен! 🎉`,
                    `Новый розыгрыш на **${prizeName}** запущен в ${targetChannel} и завершится через **${durationString}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
