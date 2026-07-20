import { MessageFlags, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError, replyUserError } from '../../utils/errorHandler.js';

// ===== НАСТРОЙКИ (ЗАМЕНИТЕ НА СВОИ) =====
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

// ===== ID РОЛЕЙ ДЛЯ АВТОВЫДАЧИ =====
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

// ===== ОБРАБОТЧИК ПРИНЯТИЯ ЗАЯВКИ =====
export const approveHandler = {
    customId: 'approve',
    async execute(interaction, client) {
        try {
            // Проверка прав
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
                    message: 'У вас нет прав для принятия заявок!' 
                });
            }

            // Получаем данные из customId
            const [, userId, factionValue] = interaction.customId.split('_');
            
            const faction = FACTIONS.find(f => f.value === factionValue);
            if (!faction) {
                throw new TitanBotError(
                    'Фракция не найдена',
                    ErrorTypes.VALIDATION,
                    'Выбранная фракция не существует.',
                    { factionValue }
                );
            }

            // Получаем пользователя
            let targetUser;
            try {
                targetUser = await interaction.guild.members.fetch(userId);
            } catch (error) {
                throw new TitanBotError(
                    'Пользователь не найден',
                    ErrorTypes.VALIDATION,
                    'Пользователь не найден на сервере.',
                    { userId }
                );
            }

            // Выдаем роль
            let roleAdded = false;
            if (ROLE_IDS[factionValue] && ROLE_IDS[factionValue] !== 'ID_РОЛИ_*') {
                try {
                    await targetUser.roles.add(ROLE_IDS[factionValue]);
                    roleAdded = true;
                    logger.info(`Роль выдана пользователю ${targetUser.user.tag}`, {
                        userId: targetUser.user.id,
                        faction: factionValue,
                        adminId: interaction.user.id,
                        guildId: interaction.guildId
                    });
                } catch (error) {
                    logger.error(`Ошибка выдачи роли:`, error);
                    throw new TitanBotError(
                        'Ошибка выдачи роли',
                        ErrorTypes.DATABASE,
                        'Не удалось выдать роль пользователю.',
                        { userId: targetUser.user.id, faction: factionValue }
                    );
                }
            }

            // Создаем embed для ответа пользователю
            const userEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Заявка одобрена!')
                .setDescription(`Поздравляем! Ваша заявка на вступление во фракцию **${faction.label}** одобрена! ${faction.emoji}`)
                .addFields(
                    { name: '📋 Фракция', value: `${faction.emoji} ${faction.label}`, inline: true },
                    { name: '👤 Администратор', value: interaction.user.tag, inline: true },
                    { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '🎯 Статус', value: roleAdded ? '✅ Роль выдана' : '⚠️ Роль не была выдана', inline: true }
                )
                .setTimestamp();

            // Отправляем результат пользователю
            try {
                await targetUser.send({ embeds: [userEmbed] });
            } catch (error) {
                logger.warn(`Не удалось отправить результат пользователю ${targetUser.user.tag}`, error);
            }

            // Обновляем сообщение админов
            await interaction.update({
                content: `✅ Заявка от **${targetUser.user.tag}** одобрена администратором **${interaction.user.tag}** ${roleAdded ? '🎉 Роль выдана!' : '⚠️ Роль не выдана!'}`,
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
                            .setDescription(`Заявка от **${targetUser.user.tag}** на фракцию **${faction.label}** одобрена`)
                            .addFields(
                                { name: 'Статус', value: '✅ Одобрена', inline: true },
                                { name: 'Администратор', value: interaction.user.tag, inline: true },
                                { name: 'Роль выдана', value: roleAdded ? 'Да' : 'Нет', inline: true }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    logger.error(`Ошибка логирования:`, error);
                }
            }

            // Ответ админу
            await interaction.followUp({
                content: roleAdded 
                    ? `✅ Вы приняли игрока **${targetUser.user.tag}** во фракцию **${faction.label}**, роль выдана!`
                    : `⚠️ Вы приняли игрока **${targetUser.user.tag}** во фракцию **${faction.label}**, но роль не была выдана!`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Ошибка в обработчике принятия заявки:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'approve',
                handler: 'zapros'
            });
        }
    }
};

// ===== ОБРАБОТЧИК ОТКЛОНЕНИЯ ЗАЯВКИ =====
export const rejectHandler = {
    customId: 'reject',
    async execute(interaction, client) {
        try {
            // Проверка прав
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
                    message: 'У вас нет прав для отклонения заявок!' 
                });
            }

            // Получаем данные из customId
            const [, userId, factionValue] = interaction.customId.split('_');
            
            const faction = FACTIONS.find(f => f.value === factionValue);
            if (!faction) {
                throw new TitanBotError(
                    'Фракция не найдена',
                    ErrorTypes.VALIDATION,
                    'Выбранная фракция не существует.',
                    { factionValue }
                );
            }

            // Получаем пользователя
            let targetUser;
            try {
                targetUser = await interaction.guild.members.fetch(userId);
            } catch (error) {
                throw new TitanBotError(
                    'Пользователь не найден',
                    ErrorTypes.VALIDATION,
                    'Пользователь не найден на сервере.',
                    { userId }
                );
            }

            // Создаем embed для ответа пользователю
            const userEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Заявка отклонена')
                .setDescription(`Ваша заявка на вступление во фракцию **${faction.label}** была отклонена.`)
                .addFields(
                    { name: '📋 Фракция', value: `${faction.emoji} ${faction.label}`, inline: true },
                    { name: '👤 Администратор', value: interaction.user.tag, inline: true },
                    { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            // Отправляем результат пользователю
            try {
                await targetUser.send({ embeds: [userEmbed] });
            } catch (error) {
                logger.warn(`Не удалось отправить результат пользователю ${targetUser.user.tag}`, error);
            }

            // Обновляем сообщение админов
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
                            .setDescription(`Заявка от **${targetUser.user.tag}** на фракцию **${faction.label}** отклонена`)
                            .addFields(
                                { name: 'Статус', value: '❌ Отклонена', inline: true },
                                { name: 'Администратор', value: interaction.user.tag, inline: true }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                } catch (error) {
                    logger.error(`Ошибка логирования:`, error);
                }
            }

            // Ответ админу
            await interaction.followUp({
                content: `❌ Вы отклонили заявку игрока **${targetUser.user.tag}** во фракцию **${faction.label}**`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Ошибка в обработчике отклонения заявки:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'reject',
                handler: 'zapros'
            });
        }
    }
};

// ===== ОБРАБОТЧИК ИНФОРМАЦИИ =====
export const infoHandler = {
    customId: 'info',
    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Кнопка использована вне гильдии',
                    ErrorTypes.VALIDATION,
                    'Эту кнопку можно использовать только на сервере.',
                    { userId: interaction.user.id }
                );
            }

            const [, userId, factionValue] = interaction.customId.split('_');
            
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
                    'Пользователь не найден на сервере.',
                    { userId }
                );
            }

            const infoEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`ℹ️ Информация о заявке`)
                .addFields(
                    { name: '📋 Фракция', value: `${faction.emoji} ${faction.label}`, inline: true },
                    { name: '🆔 ID фракции', value: `\`${factionValue}\``, inline: true },
                    { name: '👤 Заявитель', value: `${targetUser.user.tag}`, inline: true },
                    { name: '🆔 ID пользователя', value: `\`${userId}\``, inline: true },
                    { name: '👤 Администратор', value: interaction.user.tag, inline: true }
                )
                .setTimestamp();

            await interaction.reply({
                embeds: [infoEmbed],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Ошибка в обработчике информации:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'info',
                handler: 'zapros'
            });
        }
    }
};

// ===== ОБРАБОТЧИК ЛИЧНЫХ СООБЩЕНИЙ =====
export const dmHandler = {
    customId: 'dm',
    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Кнопка использована вне гильдии',
                    ErrorTypes.VALIDATION,
                    'Эту кнопку можно использовать только на сервере.',
                    { userId: interaction.user.id }
                );
            }

            const [, userId, factionValue] = interaction.customId.split('_');
            
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
                    'Пользователь не найден на сервере.',
                    { userId }
                );
            }

            // Пытаемся отправить ЛС
            let dmSent = true;
            try {
                await targetUser.send({
                    content: `📩 Вам написал администратор **${interaction.user.tag}** по поводу вашей заявки во фракцию **${faction.label}**.\nОжидайте ответа в этом чате.`
                });
            } catch (error) {
                dmSent = false;
                logger.warn(`Не удалось отправить ЛС пользователю ${targetUser.user.tag}`, error);
            }

            await interaction.reply({
                content: dmSent 
                    ? `✅ Сообщение отправлено пользователю **${targetUser.user.tag}**!` 
                    : `⚠️ Не удалось отправить сообщение пользователю **${targetUser.user.tag}** (возможно, у него закрыты ЛС)`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Ошибка в обработчике ЛС:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'dm',
                handler: 'zapros'
            });
        }
    }
};
