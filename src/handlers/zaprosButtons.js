import { MessageFlags, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError, replyUserError } from '../utils/errorHandler.js';
import { 
    approveButtonHandler,
    rejectButtonHandler,
    infoButtonHandler,
    dmButtonHandler
} from './handlers/zaprosButtons.js';

// ===== НАСТРОЙКИ (ЗАМЕНИТЕ НА СВОИ) =====
const ADMIN_CHANNEL_ID = '1528732465747857438';
const ADMIN_ROLE_ID = '1510803430166495295';
const LOG_CHANNEL_ID = '1523639667952582666';

// ===== ФРАКЦИИ ИЗ БЛЭК РАШ =====
const FACTIONS = [
    { label: '🏛️ Правительство', value: 'government', emoji: '🏛️' },
    { label: '🔐 ФСБ', value: 'fsb', emoji: '🔐' },
    { label: '🚔 МВД', value: 'mvd', emoji: '🚔' },
    { label: '🚦 ГИБДД', value: 'gibdd', emoji: '🚦' },
    { label: '⚔️ ВЧ', value: 'vch', emoji: '⚔️' },
    { label: '🏥 Центральная Больница', value: 'hospital', emoji: '🏥' },
    { label: '📺 СМИ', value: 'media', emoji: '📺' },
    { label: '🔫 Арзамасская ОПГ', value: 'arzamas', emoji: '🔫' },
    { label: '🔪 Батыревское ОПГ', value: 'batyrevo', emoji: '🔪' },
    { label: '💀 Лыткаринское ОПГ', value: 'lytkarino', emoji: '💀' }
];

// ===== ID РОЛЕЙ ДЛЯ АВТОВЫДАЧИ (ЗАМЕНИТЕ НА РЕАЛЬНЫЕ ID) =====
const ROLE_IDS = {
    'government': '1510804026206453790',
    'fsb': '1510804034552987748',
    'mvd': '1510804042924691607',
    'gibdd': '1510804051334402200',
    'vch': '1510804060087910521',
    'hospital': '1510804068145037412',
    'media': '1510804088596725920',
    'arzamas': '1510804096737607962',
    'batyrevo': '1510804105516417085',
    'lytkarino': '1510804113775001900'
};

// ===== ОБРАБОТЧИК КНОПКИ ПРИНЯТЬ =====
export const approveButtonHandler = {
    customId: 'approve',
    async execute(interaction, client) {
        try {
            const [, userId, factionValue] = interaction.customId.split('_');
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Кнопка использована вне гильдии',
                    ErrorTypes.VALIDATION,
                    'Эту кнопку можно использовать только на сервере.',
                    { userId: interaction.user.id }
                );
            }

            const member = interaction.member;
            const hasAdminRole = member.roles.cache.has(ADMIN_ROLE_ID);
            const hasAdminPerms = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPerms) {
                return replyUserError(interaction, { 
                    type: ErrorTypes.PERMISSION, 
                    message: 'У вас нет прав для обработки заявок!' 
                });
            }

            const faction = FACTIONS.find(f => f.value === factionValue);
            if (!faction) {
                throw new TitanBotError(
                    'Фракция не найдена',
                    ErrorTypes.VALIDATION,
                    'Выбранная фракция не существует.',
                    { factionValue }
                );
            }

            let targetUser;
            try {
                targetUser = await interaction.guild.members.fetch(userId);
            } catch (error) {
                throw new TitanBotError(
                    'Пользователь не найден',
                    ErrorTypes.VALIDATION,
                    'Пользователь не найден на сервере!',
                    { userId }
                );
            }

            // Выдача роли
            if (ROLE_IDS[factionValue] && ROLE_IDS[factionValue] !== 'ID_РОЛИ_*') {
                try {
                    await targetUser.roles.add(ROLE_IDS[factionValue]);
                    logger.info(`Роль выдана пользователю ${targetUser.user.tag}`, {
                        userId: targetUser.user.id,
                        faction: factionValue,
                        adminId: interaction.user.id
                    });
                } catch (error) {
                    logger.error(`Ошибка выдачи роли:`, error);
                    throw new TitanBotError(
                        'Ошибка выдачи роли',
                        ErrorTypes.UNKNOWN,
                        'Не удалось выдать роль пользователю. Проверьте права бота.',
                        { userId: targetUser.user.id, factionValue }
                    );
                }
            }

            // Результат для пользователя
            const resultEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Заявка одобрена!')
                .setDescription(`Поздравляем! Ваша заявка на вступление во фракцию **${faction.label}** одобрена! ${faction.emoji}`)
                .addFields(
                    { name: '📋 Фракция', value: `${faction.emoji} ${faction.label}`, inline: true },
                    { name: '👤 Администратор', value: interaction.user.tag, inline: true },
                    { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            try {
                await targetUser.send({ embeds: [resultEmbed] });
            } catch (error) {
                logger.warn(`Не удалось отправить результат пользователю ${targetUser.user.tag}`, error);
            }

            // Обновление сообщения
            await interaction.update({
                content: `✅ Заявка от **${targetUser.user.tag}** одобрена администратором **${interaction.user.tag}**`,
                embeds: [],
                components: []
            });

            // Логирование
            if (LOG_CHANNEL_ID) {
                try {
                    const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('📋 Заявка одобрена')
                            .setDescription(`Заявка от ${targetUser.user.tag} на фракцию ${faction.label}`)
                            .addFields(
                                { name: 'Статус', value: '✅ Одобрена' },
                                { name: 'Администратор', value: interaction.user.tag }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    logger.error(`Ошибка логирования:`, error);
                }
            }

            logger.info(`Заявка одобрена`, {
                userId: targetUser.user.id,
                faction: factionValue,
                adminId: interaction.user.id,
                guildId: interaction.guildId
            });

        } catch (error) {
            logger.error('Ошибка в обработчике approve:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'approve',
                handler: 'faction'
            });
        }
    }
};

// ===== ОБРАБОТЧИК КНОПКИ ОТКЛОНИТЬ =====
export const rejectButtonHandler = {
    customId: 'reject',
    async execute(interaction, client) {
        try {
            const [, userId, factionValue] = interaction.customId.split('_');
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Кнопка использована вне гильдии',
                    ErrorTypes.VALIDATION,
                    'Эту кнопку можно использовать только на сервере.',
                    { userId: interaction.user.id }
                );
            }

            const member = interaction.member;
            const hasAdminRole = member.roles.cache.has(ADMIN_ROLE_ID);
            const hasAdminPerms = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPerms) {
                return replyUserError(interaction, { 
                    type: ErrorTypes.PERMISSION, 
                    message: 'У вас нет прав для обработки заявок!' 
                });
            }

            const faction = FACTIONS.find(f => f.value === factionValue);
            if (!faction) {
                throw new TitanBotError(
                    'Фракция не найдена',
                    ErrorTypes.VALIDATION,
                    'Выбранная фракция не существует.',
                    { factionValue }
                );
            }

            let targetUser;
            try {
                targetUser = await interaction.guild.members.fetch(userId);
            } catch (error) {
                throw new TitanBotError(
                    'Пользователь не найден',
                    ErrorTypes.VALIDATION,
                    'Пользователь не найден на сервере!',
                    { userId }
                );
            }

            // Результат для пользователя
            const resultEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Заявка отклонена')
                .setDescription(`Ваша заявка на вступление во фракцию **${faction.label}** была отклонена.`)
                .addFields(
                    { name: '📋 Фракция', value: `${faction.emoji} ${faction.label}`, inline: true },
                    { name: '👤 Администратор', value: interaction.user.tag, inline: true },
                    { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            try {
                await targetUser.send({ embeds: [resultEmbed] });
            } catch (error) {
                logger.warn(`Не удалось отправить результат пользователю ${targetUser.user.tag}`, error);
            }

            // Обновление сообщения
            await interaction.update({
                content: `❌ Заявка от **${targetUser.user.tag}** отклонена администратором **${interaction.user.tag}**`,
                embeds: [],
                components: []
            });

            // Логирование
            if (LOG_CHANNEL_ID) {
                try {
                    const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('📋 Заявка отклонена')
                            .setDescription(`Заявка от ${targetUser.user.tag} на фракцию ${faction.label}`)
                            .addFields(
                                { name: 'Статус', value: '❌ Отклонена' },
                                { name: 'Администратор', value: interaction.user.tag }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    logger.error(`Ошибка логирования:`, error);
                }
            }

            logger.info(`Заявка отклонена`, {
                userId: targetUser.user.id,
                faction: factionValue,
                adminId: interaction.user.id,
                guildId: interaction.guildId
            });

        } catch (error) {
            logger.error('Ошибка в обработчике reject:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'reject',
                handler: 'faction'
            });
        }
    }
};

// ===== ОБРАБОТЧИК КНОПКИ ИНФОРМАЦИЯ =====
export const infoButtonHandler = {
    customId: 'info',
    async execute(interaction, client) {
        try {
            const [, userId, factionValue] = interaction.customId.split('_');
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Кнопка использована вне гильдии',
                    ErrorTypes.VALIDATION,
                    'Эту кнопку можно использовать только на сервере.',
                    { userId: interaction.user.id }
                );
            }

            const member = interaction.member;
            const hasAdminRole = member.roles.cache.has(ADMIN_ROLE_ID);
            const hasAdminPerms = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPerms) {
                return replyUserError(interaction, { 
                    type: ErrorTypes.PERMISSION, 
                    message: 'У вас нет прав для просмотра информации о заявке!' 
                });
            }

            const faction = FACTIONS.find(f => f.value === factionValue);
            if (!faction) {
                throw new TitanBotError(
                    'Фракция не найдена',
                    ErrorTypes.VALIDATION,
                    'Выбранная фракция не существует.',
                    { factionValue }
                );
            }

            let targetUser;
            try {
                targetUser = await interaction.guild.members.fetch(userId);
            } catch (error) {
                throw new TitanBotError(
                    'Пользователь не найден',
                    ErrorTypes.VALIDATION,
                    'Пользователь не найден на сервере!',
                    { userId }
                );
            }

            const infoEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`ℹ️ Информация о фракции: ${faction.label}`)
                .addFields(
                    { name: '📋 Название', value: faction.label },
                    { name: '🆔 ID', value: `\`${factionValue}\`` },
                    { name: '👤 Заявитель', value: `${targetUser.user.tag} (${targetUser.id})` },
                    { name: '🎯 Роль', value: ROLE_IDS[factionValue] ? `<@&${ROLE_IDS[factionValue]}>` : 'Не настроена' }
                )
                .setTimestamp();

            await interaction.reply({
                embeds: [infoEmbed],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Ошибка в обработчике info:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'info',
                handler: 'faction'
            });
        }
    }
};

// ===== ОБРАБОТЧИК КНОПКИ НАПИСАТЬ В ЛС =====
export const dmButtonHandler = {
    customId: 'dm',
    async execute(interaction, client) {
        try {
            const [, userId, factionValue] = interaction.customId.split('_');
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Кнопка использована вне гильдии',
                    ErrorTypes.VALIDATION,
                    'Эту кнопку можно использовать только на сервере.',
                    { userId: interaction.user.id }
                );
            }

            const member = interaction.member;
            const hasAdminRole = member.roles.cache.has(ADMIN_ROLE_ID);
            const hasAdminPerms = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPerms) {
                return replyUserError(interaction, { 
                    type: ErrorTypes.PERMISSION, 
                    message: 'У вас нет прав для отправки сообщений пользователям!' 
                });
            }

            const faction = FACTIONS.find(f => f.value === factionValue);
            if (!faction) {
                throw new TitanBotError(
                    'Фракция не найдена',
                    ErrorTypes.VALIDATION,
                    'Выбранная фракция не существует.',
                    { factionValue }
                );
            }

            let targetUser;
            try {
                targetUser = await interaction.guild.members.fetch(userId);
            } catch (error) {
                throw new TitanBotError(
                    'Пользователь не найден',
                    ErrorTypes.VALIDATION,
                    'Пользователь не найден на сервере!',
                    { userId }
                );
            }

            try {
                await targetUser.send({
                    content: `📩 Вам написал администратор **${interaction.user.tag}** по поводу вашей заявки во фракцию **${faction.label}**.\nОжидайте ответа в этом чате.`
                });
            } catch (error) {
                logger.warn(`Не удалось отправить ЛС пользователю ${targetUser.user.tag}`, error);
                throw new TitanBotError(
                    'Ошибка отправки ЛС',
                    ErrorTypes.UNKNOWN,
                    'Не удалось отправить личное сообщение пользователю. Возможно, у него закрыты ЛС.',
                    { userId: targetUser.user.id }
                );
            }

            await interaction.reply({
                embeds: [
                    successEmbed(
                        'Сообщение отправлено ✅',
                        `Сообщение отправлено пользователю ${targetUser.user.tag}!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

            logger.info(`DM отправлен пользователю ${targetUser.user.tag}`, {
                userId: targetUser.user.id,
                adminId: interaction.user.id,
                guildId: interaction.guildId
            });

        } catch (error) {
            logger.error('Ошибка в обработчике dm:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'dm',
                handler: 'faction'
            });
        }
    }
};
