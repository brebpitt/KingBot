import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// ===== КОНФИГУРАЦИЯ =====
const ADMIN_CHANNEL_ID = '1528732465747857438';
const ADMIN_ROLE_ID = '1510803430166495295';
const LOG_CHANNEL_ID = '1523639667952582666';
const CC_ROLE_ID = '1510804123309510656'; // Замените на реальный ID

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

// ===== ID РОЛЕЙ =====
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

export default {
    data: new SlashCommandBuilder()
        .setName('панель_ролей')
        .setDescription('Создает панель для выдачи государственных ролей'),

    async execute(interaction) {
        // Проверка прав
        if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID) && 
            !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return InteractionHelper.safeReply(interaction, {
                content: '❌ У вас нет прав для использования этой команды!',
                ephemeral: true
            });
        }

        // Проверка канала
        if (interaction.channel.id !== ADMIN_CHANNEL_ID) {
            return InteractionHelper.safeReply(interaction, {
                content: `❌ Команду можно использовать только в канале <#${ADMIN_CHANNEL_ID}>`,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🏛️ Роли государственных организаций! 🎯')
            .setDescription('Уважаемые игроки! Тут вы сможете получить роли гос. организаций. Следуйте инструкциям после нажатия на кнопку "Получить роль"!')
            .addFields(
                { 
                    name: '📋 Порядок подачи', 
                    value: '1️⃣ Нажмите на кнопку ниже.\n2️⃣ Заполните форму.\n3️⃣ Отправьте скрин статистики в личные сообщения бота.' 
                },
                { 
                    name: '📊 Статистика', 
                    value: '157   43   40   31   28\n18   17   15   13   16',
                    inline: true 
                },
                { 
                    name: '💬 Всё прочитали?', 
                    value: 'Загляните на канал <#1523639698951307264>', 
                    inline: true 
                }
            )
            .setFooter({ text: '26/29/30 | Checker BOT 14.06.2026 22:24' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('get_role_panel')
                    .setLabel('🎯 Получить роль')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('cc_role_panel')
                    .setLabel('⭐ Роль СС')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('remove_roles_panel')
                    .setLabel('🗑️ Снять роли')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        
        return InteractionHelper.safeReply(interaction, {
            content: '✅ Панель ролей успешно создана!',
            ephemeral: true
        });
    },

    // ===== ОБРАБОТКА КНОПОК =====
    async handleButton(interaction) {
        const customId = interaction.customId;

        // ===== КНОПКА "ПОЛУЧИТЬ РОЛЬ" =====
        if (customId === 'get_role_panel') {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('faction_select_panel')
                .setPlaceholder('Выберите фракцию')
                .addOptions(
                    FACTIONS.map(f => ({
                        label: f.label,
                        value: f.value,
                        emoji: f.emoji
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            return InteractionHelper.safeReply(interaction, {
                content: '**Выберите фракцию, в которой состоите:**',
                components: [row],
                ephemeral: true
            });
        }

        // ===== КНОПКА "РОЛЬ СС" =====
        if (customId === 'cc_role_panel') {
            const member = interaction.member;
            
            try {
                if (member.roles.cache.has(CC_ROLE_ID)) {
                    await member.roles.remove(CC_ROLE_ID);
                    await InteractionHelper.safeReply(interaction, {
                        content: '⭐ Роль СС снята!',
                        ephemeral: true
                    });
                    await this.logAction(interaction.guild, `${member.user.tag} снял(а) роль СС`, 'CC_REMOVE');
                } else {
                    await member.roles.add(CC_ROLE_ID);
                    await InteractionHelper.safeReply(interaction, {
                        content: '⭐ Роль СС выдана!',
                        ephemeral: true
                    });
                    await this.logAction(interaction.guild, `${member.user.tag} получил(а) роль СС`, 'CC_ADD');
                }
            } catch (error) {
                logger.error('Ошибка при выдаче/снятии роли СС:', error);
                await InteractionHelper.safeReply(interaction, {
                    content: '❌ Произошла ошибка при выдаче/снятии роли!',
                    ephemeral: true
                });
            }
            return;
        }

        // ===== КНОПКА "СНЯТЬ РОЛИ" =====
        if (customId === 'remove_roles_panel') {
            const member = interaction.member;
            const removedRoles = [];
            
            try {
                for (const [key, roleId] of Object.entries(ROLE_IDS)) {
                    if (member.roles.cache.has(roleId)) {
                        await member.roles.remove(roleId);
                        const faction = FACTIONS.find(f => f.value === key);
                        removedRoles.push(faction ? faction.label : key);
                    }
                }

                if (member.roles.cache.has(CC_ROLE_ID)) {
                    await member.roles.remove(CC_ROLE_ID);
                    removedRoles.push('⭐ СС');
                }

                if (removedRoles.length === 0) {
                    return InteractionHelper.safeReply(interaction, {
                        content: 'ℹ️ У вас нет государственных ролей для снятия!',
                        ephemeral: true
                    });
                }

                await InteractionHelper.safeReply(interaction, {
                    content: `✅ Сняты роли:\n${removedRoles.map(r => `• ${r}`).join('\n')}`,
                    ephemeral: true
                });
                
                await this.logAction(interaction.guild, 
                    `${member.user.tag} снял(а) роли: ${removedRoles.join(', ')}`, 
                    'ROLES_REMOVE'
                );
            } catch (error) {
                logger.error('Ошибка при снятии ролей:', error);
                await InteractionHelper.safeReply(interaction, {
                    content: '❌ Произошла ошибка при снятии ролей!',
                    ephemeral: true
                });
            }
            return;
        }

        // ===== КНОПКА "ОТМЕНИТЬ ЗАПРОС" =====
        if (customId === 'cancel_request_panel') {
            const member = interaction.member;
            let removedCount = 0;

            for (const roleId of Object.values(ROLE_IDS)) {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId);
                    removedCount++;
                }
            }

            if (member.roles.cache.has(CC_ROLE_ID)) {
                await member.roles.remove(CC_ROLE_ID);
                removedCount++;
            }

            await InteractionHelper.safeUpdate(interaction, {
                content: `❌ Запрос роли отменен. Снято ${removedCount} ролей.`,
                components: [],
                embeds: []
            });
            return;
        }
    },

    // ===== ОБРАБОТКА ВЫБОРА ФРАКЦИИ =====
    async handleSelectMenu(interaction) {
        if (interaction.customId !== 'faction_select_panel') return;

        const selectedFaction = interaction.values[0];
        const faction = FACTIONS.find(f => f.value === selectedFaction);
        const roleId = ROLE_IDS[selectedFaction];

        if (!roleId) {
            return InteractionHelper.safeUpdate(interaction, {
                content: '❌ Ошибка: роль для этой фракции не найдена!',
                components: []
            });
        }

        if (interaction.member.roles.cache.has(roleId)) {
            return InteractionHelper.safeUpdate(interaction, {
                content: `ℹ️ У вас уже есть роль фракции ${faction.label}!`,
                components: []
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`role_form_${selectedFaction}`)
            .setTitle('📝 Подача заявки');

        const nicknameInput = new TextInputBuilder()
            .setCustomId('nickname')
            .setLabel('Укажите свой полный никнейм')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Maxim_Apache')
            .setRequired(true)
            .setMaxLength(32);

        const rankInput = new TextInputBuilder()
            .setCustomId('rank')
            .setLabel('Укажите ваш порядковый ранг (только цифра)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('3')
            .setRequired(true)
            .setMaxLength(2);

        const row1 = new ActionRowBuilder().addComponents(nicknameInput);
        const row2 = new ActionRowBuilder().addComponents(rankInput);
        modal.addComponents(row1, row2);

        await interaction.showModal(modal);
    },

    // ===== ОБРАБОТКА МОДАЛЬНОГО ОКНА =====
    async handleModalSubmit(interaction) {
        if (!interaction.customId.startsWith('role_form_')) return;

        const selectedFaction = interaction.customId.replace('role_form_', '');
        const faction = FACTIONS.find(f => f.value === selectedFaction);
        const roleId = ROLE_IDS[selectedFaction];
        const nickname = interaction.fields.getTextInputValue('nickname');
        const rank = interaction.fields.getTextInputValue('rank');

        try {
            await interaction.member.roles.add(roleId);
            
            await InteractionHelper.safeReply(interaction, {
                content: `✅ **Заявка успешно подана!**\n\n` +
                        `🏷️ Никнейм: ${nickname}\n` +
                        `📊 Ранг: ${rank}\n` +
                        `🏛️ Фракция: ${faction.label}\n\n` +
                        `📸 **Следующий шаг:**\n` +
                        `Отправьте скрин статистики в личные сообщения бота.`,
                ephemeral: true,
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('cancel_request_panel')
                                .setLabel('❌ Отменить запрос роли')
                                .setStyle(ButtonStyle.Secondary)
                        )
                ]
            });

            await this.logAction(interaction.guild, 
                `${interaction.user.tag} получил(а) роль ${faction.label} (Ник: ${nickname}, Ранг: ${rank})`, 
                'ROLE_ADD'
            );

            try {
                await interaction.user.send({
                    content: `📸 **${nickname}**, отправьте скрин статистики в этот диалог для получения роли.\n\n` +
                            `📋 Данные заявки:\n` +
                            `• Фракция: ${faction.label}\n` +
                            `• Ранг: ${rank}\n\n` +
                            `⏳ Ожидайте проверки администрацией.`
                });
            } catch (error) {
                logger.warn('Не удалось отправить ЛС пользователю');
            }

        } catch (error) {
            logger.error('Ошибка при выдаче роли:', error);
            await InteractionHelper.safeReply(interaction, {
                content: '❌ Произошла ошибка при выдаче роли!',
                ephemeral: true
            });
        }
    },

    // ===== ФУНКЦИЯ ЛОГИРОВАНИЯ =====
    async logAction(guild, message, type) {
        try {
            const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
            if (!logChannel) return;

            const colors = {
                'ROLE_ADD': '#00FF00',
                'ROLE_REMOVE': '#FF0000',
                'CC_ADD': '#FFD700',
                'CC_REMOVE': '#FF6B00',
                'ROLES_REMOVE': '#FF4444'
            };

            const embed = new EmbedBuilder()
                .setColor(colors[type] || '#0099FF')
                .setTitle('📋 Лог действий с ролями')
                .setDescription(message)
                .addFields(
                    { name: '🕐 Время', value: new Date().toLocaleString('ru-RU'), inline: true },
                    { name: '📌 Тип', value: type, inline: true }
                )
                .setFooter({ text: `ID: ${guild.id}` })
                .setTimestamp();

            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            logger.error('Ошибка логирования:', error);
        }
    }
};
