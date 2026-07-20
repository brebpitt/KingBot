import { SlashCommandBuilder } from 'discord.js';
import { EmbedBuilder } from '@discordjs/builders';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("сервер_инфо")
        .setDescription("Получить подробную информацию о сервере"),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`ServerInfo interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'сервер_инфо'
            });
            return;
        }

        const guild = interaction.guild;
        const owner = await guild.fetchOwner();
        const createdTimestamp = Math.floor(guild.createdAt.getTime() / 1000);

        // Статистика участников
        const totalMembers = guild.memberCount;
        const members = guild.members.cache;
        const botCount = members.filter(m => m.user.bot).size;
        const humanCount = totalMembers - botCount;

        // Статусы
        const statuses = {
            online: members.filter(m => m.presence?.status === 'online').size,
            idle: members.filter(m => m.presence?.status === 'idle').size,
            dnd: members.filter(m => m.presence?.status === 'dnd').size,
            offline: members.filter(m => !m.presence || m.presence.status === 'offline').size
        };

        // Каналы
        const channels = guild.channels.cache;
        const textChannels = channels.filter(c => c.type === 0).size;
        const voiceChannels = channels.filter(c => c.type === 2).size;
        const categoryChannels = channels.filter(c => c.type === 4).size;
        const newsChannels = channels.filter(c => c.type === 5).size;
        const stageChannels = channels.filter(c => c.type === 13).size;

        // Эмодзи
        const emojis = guild.emojis.cache;
        const totalEmojis = emojis.size;
        const animatedEmojis = emojis.filter(e => e.animated).size;
        const staticEmojis = totalEmojis - animatedEmojis;

        // Бусты
        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount;

        // Возраст сервера
        const ageMs = Date.now() - guild.createdAt.getTime();
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        const ageMonths = Math.floor(ageDays / 30);
        const ageText = ageMonths > 0 ? `${ageMonths} месяцев назад` : `${ageDays} дней назад`;

        // Баннер
        const bannerUrl = guild.bannerURL({ size: 1024 });

        // EmbedBuilder ИЗ discord.js
        const embed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(guild.iconURL({ size: 256, dynamic: true }))
            .setDescription(
                `🆔 **ID сервера**\n${guild.id}\n\n` +
                `👑 **Владелец**\n${owner.user.tag}\n\n` +
                `📅 **Создан**\n<t:${createdTimestamp}:F>\n` +
                `⏳ - Возраст сервера\n  ${ageText}\n` +
                `👥 - Участников\n  ${totalMembers} всего\n  👤 ${humanCount} людей\n  🤖 ${botCount} ботов\n` +
                `📁 - Каналов\n  ${channels.size} всего\n  💬 ${textChannels} текстовых\n  🔊 ${voiceChannels} голосовых\n  📂 ${categoryChannels} категорий\n` +
                `🎭 - Ролей\n  ${guild.roles.cache.size}\n` +
                `😀 - Эмодзи\n  ${totalEmojis}\n` +
                `💎 - Буст\n  Уровень ${boostLevel}\n  ${boostCount} бустов\n` +
                `🔒 - Уровень проверки\n  ${['Нет', 'Низкий', 'Средний', 'Высокий', 'Максимальный'][guild.verificationLevel] || 'Неизвестно'}`
            )
            .setFooter({
                text: `🆔 ${guild.id}`,
                iconURL: guild.iconURL({ dynamic: true })
            })
            .setTimestamp();

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        logger.info(`ServerInfo command executed`, {
            userId: interaction.user.id,
            guildId: guild.id,
            guildName: guild.name,
            memberCount: guild.memberCount
        });
    },
};
