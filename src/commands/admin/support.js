import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits, 
    ChannelType 
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// ===== НАСТРОЙКИ =====
const ADMIN_ROLE_ID = '1510803430166495295'; // ID роли администрации
const HEX_REGEX = /^#?[0-9A-Fa-f]{6}$/;

export default {
    data: new SlashCommandBuilder()
        .setName('поддержка_панель')
        .setDescription('Отправить панель поддержки сервера KING MOBILE')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('заголовок')
                .setDescription('Заголовок обращения')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('текст')
                .setDescription('Основной текст или инструкция')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('цвет')
                .setDescription('Цвет эмбеда в HEX (например: #FF6B00 или 3498db)')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('канал')
                .setDescription('Канал для отправки панели поддержки')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    async execute(interaction) {
        // Если у вас единый хэндлер для всех интерактивов:
        if (interaction.isButton()) {
            await this.handleButton(interaction);
            return;
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction, true);
        if (!deferSuccess) return;

        const title = interaction.options.getString('заголовок');
        const text = interaction.options.getString('текст');
        let color = interaction.options.getString('цвет').trim();
        const targetChannel = interaction.options.getChannel('канал');

        // Валидация HEX-цвета
        if (!HEX_REGEX.test(color)) {
            await InteractionHelper.safeEditReply(interaction, {
                content: `❌ Некорректный HEX-формат цвета! Используйте формат вида \`#FF6B00\` или \`3498db\`.`
            });
            return;
        }

        if (!color.startsWith('#')) {
            color = `#${color}`;
        }

        try {
            const supportEmbed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(text)
                .setColor(color)
                .setFooter({ text: 'Поддержка сервера KING MOBILE' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_create')
                    .setLabel('🗃️ Создать обращение')
                    .setStyle(ButtonStyle.Primary)
            );

            await targetChannel.send({
                embeds: [supportEmbed],
                components: [row]
            });

            await InteractionHelper.safeEditReply(interaction, {
                content: `✅ Панель поддержки успешно отправлена в ${targetChannel}!`
            });

        } catch (error) {
            logger.error(`Ошибка при отправке панели поддержки:`, error);
            await InteractionHelper.safeEditReply(interaction, {
                content: `❌ Не удалось отправить панель в указанный канал.`
            });
        }
    },

    // ===== ОБРАБОТКА КНОПОК =====
    async handleButton(interaction) {
        const { customId, guild, user, channel, member } = interaction;

        // --- СОЗДАНИЕ ТИКЕТА ---
        if (customId === 'ticket_create') {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, true);
            if (!deferSuccess) return;

            try {
                const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
                const channelName = `ticket-${cleanUsername}`;

                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        },
                        {
                            id: ADMIN_ROLE_ID,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        }
                    ]
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('Тикет создан!')
                    .setColor('#2b2d31')
                    .addFields(
                        { name: 'Создал:', value: `${user}`, inline: true },
                        { name: 'Дата открытия:', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setFooter({ text: 'Поддержка сервера KING MOBILE' })
                    .setTimestamp();

                const ticketRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_claim')
                        .setLabel('👤 Взять обращение')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('ticket_close')
                        .setLabel('🔐 Закрыть тикет')
                        .setStyle(ButtonStyle.Danger)
                );

                await ticketChannel.send({
                    content: `Приветствуем ${user}! Опишите вашу проблему, администрация ответит в ближайшее время.`,
                    embeds: [ticketEmbed],
                    components: [ticketRow]
                });

                await InteractionHelper.safeEditReply(interaction, {
                    content: `✅ Ваш тикет создан: ${ticketChannel}`
                });

            } catch (error) {
                logger.error(`Ошибка при создании тикета:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    content: `❌ Произошла ошибка при создании обращения.`
                });
            }
        }

        // --- ВЗЯТЬ ОБРАЩЕНИЕ ---
        if (customId === 'ticket_claim') {
            const hasAdminRole = member?.roles?.cache?.has(ADMIN_ROLE_ID);
            const hasAdminPerms = member?.permissions?.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPerms) {
                return interaction.reply({
                    content: '❌ У вас нет прав для взятия тикетов!',
                    ephemeral: true
                });
            }

            const originalEmbed = interaction.message.embeds[0];
            const creatorField = originalEmbed?.fields?.find(f => f.name === 'Создал:');
            const creatorMention = creatorField ? creatorField.value : 'Пользователь';

            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_claim')
                    .setLabel('👤 Взято')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('🔐 Закрыть тикет')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.update({ components: [updatedRow] });
            await channel.send({ content: `${creatorMention}, тикет взял администратор ${user}!` });
        }

        // --- ЗАКРЫТЬ ТИКЕТ ---
        if (customId === 'ticket_close') {
            await interaction.reply({ content: '🔐 Тикет будет удален через 5 секунд...' });

            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    logger.error(`Ошибка при удалении канала тикета:`, error);
                }
            }, 5000);
        }
    }
};
        
