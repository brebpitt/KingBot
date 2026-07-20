import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Colors,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} from 'discord.js';
import { logger } from './logger.js';
import { InteractionHelper } from './interactionHelper.js';
import { chsStore } from './chsStore.js';

// ===== НАСТРОЙКИ (ЗАМЕНИТЕ НА СВОИ) =====
const ADMIN_ROLE_ID = 'ВАШ_ID_РОЛИ_АДМИНА';

// ===== ВИДЫ ЧС =====
const CHS_TYPES = {
    'ЧСЛ': { label: 'ЧСЛ', emoji: '🔴', color: Colors.Red },
    'ЧСП': { label: 'ЧСП', emoji: '🟠', color: Colors.Orange },
    'ЧСГОС': { label: 'ЧСГОС', emoji: '🟡', color: Colors.Gold },
    'ЧССС': { label: 'ЧССС', emoji: '🟢', color: Colors.Green }
};

/**
 * Класс для обработки кнопок ЧС
 */
export class CHSButtons {
    /**
     * Проверка инициализации хранилища
     */
    static checkStore() {
        if (!chsStore || typeof chsStore.get !== 'function') {
            logger.error('chsStore не инициализирован или не имеет метода get');
            return false;
        }
        return true;
    }

    /**
     * Проверка прав администратора
     */
    static async checkAdminPermissions(interaction) {
        try {
            const member = interaction.member;
            if (!member) {
                await interaction.reply({
                    content: '❌ Не удалось определить ваши права!',
                    ephemeral: true
                });
                return false;
            }

            const hasAdminRole = member.roles.cache.has(ADMIN_ROLE_ID);
            const hasAdminPerms = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPerms) {
                await interaction.reply({
                    content: '❌ У вас нет прав для управления ЧС!',
                    ephemeral: true
                });
                return false;
            }
            return true;
        } catch (error) {
            logger.error('Ошибка при проверке прав:', error);
            await interaction.reply({
                content: '❌ Произошла ошибка при проверке прав.',
                ephemeral: true
            });
            return false;
        }
    }

    /**
     * Получение участника по ID
     */
    static async getMember(interaction, userId) {
        try {
            if (!interaction.guild) {
                await interaction.reply({
                    content: '❌ Эту команду можно использовать только на сервере!',
                    ephemeral: true
                });
                return null;
            }
            return await interaction.guild.members.fetch(userId);
        } catch (error) {
            logger.error(`Ошибка при получении пользователя ${userId}:`, error);
            await interaction.reply({
                content: '❌ Пользователь не найден на сервере!',
                ephemeral: true
            });
            return null;
        }
    }

    /**
     * Безопасное обновление сообщения
     */
    static async safeUpdate(interaction, data) {
        try {
            if (interaction.message) {
                await interaction.update(data);
            } else {
                await interaction.reply({
                    ...data,
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error('Ошибка при обновлении сообщения:', error);
            await interaction.reply({
                content: '❌ Не удалось обновить сообщение. Возможно, оно было удалено.',
                ephemeral: true
            });
        }
    }

    /**
     * Отправка ЛС с обработкой ошибок
     */
    static async safeDM(member, content) {
        try {
            await member.send(content);
            return true;
        } catch (error) {
            logger.warn(`Не удалось отправить ЛС пользователю ${member.user.tag}:`, error);
            return false;
        }
    }

    /**
     * Главный обработчик кнопок
     */
    static async handleButton(interaction) {
        try {
            // Проверяем инициализацию хранилища
            if (!this.checkStore()) {
                await interaction.reply({
                    content: '❌ Ошибка инициализации системы ЧС!',
                    ephemeral: true
                });
                return true;
            }

            // Обработка модальных окон
            if (interaction.isModalSubmit()) {
                await this.handleModal(interaction);
                return true;
            }

            // Проверяем, что это кнопка ЧС
            if (!interaction.customId?.startsWith('chs_')) return false;

            // Разбираем ID
            const parts = interaction.customId.split('_');
            if (parts.length < 3) {
                await interaction.reply({
                    content: '❌ Некорректный формат кнопки!',
                    ephemeral: true
                });
                return true;
            }

            const action = parts[1];
            const userId = parts[2];
            const extra = parts[3] || null;

            // Проверка прав
            const hasAccess = await this.checkAdminPermissions(interaction);
            if (!hasAccess) return true;

            // Получаем пользователя
            const member = await this.getMember(interaction, userId);
            if (!member) return true;

            // Обработка действий
            switch (action) {
                case 'remove':
                    await this.handleRemove(interaction, member, extra);
                    break;
                case 'removeall':
                    await this.handleRemoveAll(interaction, member);
                    break;
                case 'info':
                    await this.handleInfo(interaction, member);
                    break;
                case 'dm':
                    await this.handleDM(interaction, member);
                    break;
                case 'restore':
                    await this.handleRestore(interaction, member, extra);
                    break;
                case 'history':
                    await this.handleHistory(interaction, member);
                    break;
                case 'note':
                    await this.handleNote(interaction, member);
                    break;
                case 'warn':
                    await this.handleWarn(interaction, member);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Неизвестное действие!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            logger.error('Ошибка в handleButton:', error);
            await interaction.reply({
                content: '❌ Произошла критическая ошибка при обработке кнопки!',
                ephemeral: true
            });
        }

        return true;
    }

    /**
     * Обработка: Снять конкретное ЧС
     */
    static async handleRemove(interaction, member, index) {
        try {
            const userId = member.user.id;
            const penalties = chsStore.get(userId);

            if (!penalties || penalties.length === 0) {
                return interaction.reply({
                    content: `✅ У игрока **${member.user.tag}** нет активных ЧС.`,
                    ephemeral: true
                });
            }

            const idx = parseInt(index);
            if (isNaN(idx) || idx < 0 || idx >= penalties.length) {
                return interaction.reply({
                    content: '❌ Неверный индекс ЧС!',
                    ephemeral: true
                });
            }

            const removedPenalty = penalties[idx];
            const chsInfo = CHS_TYPES[removedPenalty.type] || { emoji: '⚪', color: Colors.Grey };

            // Удаляем ЧС
            chsStore.remove(userId, idx);

            // Обновляем сообщение
            const embed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('✅ ЧС снято')
                .setDescription(`С игрока **${member.user.tag}** снято ЧС **${removedPenalty.type}**`)
                .addFields(
                    { name: '📋 Вид', value: `${chsInfo.emoji} ${removedPenalty.type}`, inline: true },
                    { name: '👮 Снял', value: interaction.user.tag, inline: true },
                    { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '📝 Причина выдачи', value: removedPenalty.reason || 'Не указана', inline: false }
                )
                .setTimestamp();

            await this.safeUpdate(interaction, {
                embeds: [embed],
                components: []
            });

            // Уведомляем игрока в ЛС
            await this.safeDM(member, {
                content: `✅ С вас снято ЧС **${removedPenalty.type}** администратором **${interaction.user.tag}**.`
            });

            logger.info(`ЧС снято с пользователя ${member.user.tag}`, {
                userId: member.user.id,
                type: removedPenalty.type,
                adminId: interaction.user.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error('Ошибка в handleRemove:', error);
            await interaction.reply({
                content: '❌ Произошла ошибка при снятии ЧС.',
                ephemeral: true
            });
        }
    }

    /**
     * Обработка: Снять все ЧС
     */
    static async handleRemoveAll(interaction, member) {
        try {
            const userId = member.user.id;
            const penalties = chsStore.get(userId);

            if (!penalties || penalties.length === 0) {
                return interaction.reply({
                    content: `✅ У игрока **${member.user.tag}** нет активных ЧС.`,
                    ephemeral: true
                });
            }

            const removedTypes = penalties.map(p => p.type).join(', ');

            // Удаляем все ЧС
            chsStore.removeAll(userId);

            // Обновляем сообщение
            const embed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('✅ Все ЧС сняты')
                .setDescription(`С игрока **${member.user.tag}** сняты все ЧС`)
                .addFields(
                    { name: '📋 Снятые виды', value: removedTypes || 'Неизвестно', inline: true },
                    { name: '👮 Снял', value: interaction.user.tag, inline: true },
                    { name: '📅 Количество', value: `${penalties.length} запись(ей)`, inline: true }
                )
                .setTimestamp();

            await this.safeUpdate(interaction, {
                embeds: [embed],
                components: []
            });

            // Уведомляем игрока в ЛС
            await this.safeDM(member, {
                content: `✅ С вас сняты все ЧС администратором **${interaction.user.tag}**.`
            });

            logger.info(`Все ЧС сняты с пользователя ${member.user.tag}`, {
                userId: member.user.id,
                count: penalties.length,
                adminId: interaction.user.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error('Ошибка в handleRemoveAll:', error);
            await interaction.reply({
                content: '❌ Произошла ошибка при снятии всех ЧС.',
                ephemeral: true
            });
        }
    }

    /**
     * Обработка: Информация о ЧС игрока
     */
    static async handleInfo(interaction, member) {
        try {
            const userId = member.user.id;
            const penalties = chsStore.get(userId);

            if (!penalties || penalties.length === 0) {
                return interaction.reply({
                    content: `✅ У игрока **${member.user.tag}** нет активных ЧС.`,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📋 Информация о ЧС игрока ${member.user.tag}`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setDescription(`Всего активных ЧС: **${penalties.length}**`);

            penalties.forEach((p, index) => {
                const chsInfo = CHS_TYPES[p.type] || { emoji: '⚪', color: Colors.Grey };
                embed.addFields({
                    name: `#${index + 1} ${chsInfo.emoji} ${p.type}`,
                    value: `📅 Срок: \`${p.duration || 'Не указан'}\`\n📝 Причина: ${p.reason || 'Не указана'}\n👮 Выдал: ${p.moderator || 'Неизвестен'}\n📅 Дата: <t:${Math.floor((p.timestamp || Date.now()) / 1000)}:F>`,
                    inline: false
                });
            });

            embed.setFooter({ text: `ID игрока: ${member.user.id}` }).setTimestamp();

            // Кнопки для навигации
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`chs_removeall_${member.user.id}`)
                        .setLabel('🗑️ Снять все')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`chs_dm_${member.user.id}`)
                        .setLabel('✉️ Написать в ЛС')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`chs_history_${member.user.id}`)
                        .setLabel('📜 История')
                        .setStyle(ButtonStyle.Secondary)
                );

            // Добавляем кнопки для снятия каждого ЧС
            const row2 = new ActionRowBuilder();
            const maxButtons = 5;
            const showButtons = Math.min(penalties.length, maxButtons);

            for (let i = 0; i < showButtons; i++) {
                const p = penalties[i];
                const chsInfo = CHS_TYPES[p.type] || { emoji: '⚪' };
                row2.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`chs_remove_${member.user.id}_${i}`)
                        .setLabel(`${chsInfo.emoji} ${p.type}`)
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            const components = [row];
            if (row2.components.length > 0) {
                components.push(row2);
            }

            await interaction.reply({
                embeds: [embed],
                components: components,
                ephemeral: true
            });
        } catch (error) {
            logger.error('Ошибка в handleInfo:', error);
            await interaction.reply({
                content: '❌ Произошла ошибка при получении информации о ЧС.',
                ephemeral: true
            });
        }
    }

    /**
     * Обработка: Написать в ЛС
     */
    static async handleDM(interaction, member) {
        try {
            // Создаём модальное окно
            const modal = new ModalBuilder()
                .setCustomId(`chs_modal_${member.user.id}`)
                .setTitle('✉️ Отправить сообщение');

            const messageInput = new TextInputBuilder()
                .setCustomId('dm_message')
                .setLabel('Текст сообщения')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Введите сообщение для игрока...')
                .setRequired(true)
                .setMaxLength(1000);

            const row = new ActionRowBuilder().addComponents(messageInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        } catch (error) {
            logger.error('Ошибка в handleDM:', error);
            await interaction.reply({
                content: '❌ Произошла ошибка при создании модального окна.',
                ephemeral: true
            });
        }
    }

    /**
     * Обработка: Модальное окно (отправка ЛС)
     */
    static async handleModal(interaction) {
        try {
            if (!interaction.isModalSubmit()) return;

            const customId = interaction.customId;
            if (!customId.startsWith('chs_modal_')) return;

            const userId = customId.split('_')[2];
            if (!userId) {
                await interaction.reply({
                    content: '❌ Ошибка: не указан ID пользователя.',
                    ephemeral: true
                });
                return;
            }

            const message = interaction.fields.getTextInputValue('dm_message');
            if (!message || message.trim().length === 0) {
                await interaction.reply({
                    content: '❌ Сообщение не может быть пустым!',
                    ephemeral: true
                });
                return;
            }

            const member = await interaction.guild.members.fetch(userId);
            if (!member) {
                await interaction.reply({
                    content: '❌ Пользователь не найден на сервере!',
                    ephemeral: true
                });
                return;
            }

            const sent = await this.safeDM(member, {
                content: `📩 **Сообщение от администратора ${interaction.user.tag}:**\n\n${message}`
            });

            if (sent) {
                await interaction.reply({
                    content: `✅ Сообщение успешно отправлено пользователю **${member.user.tag}**!`,
                    ephemeral: true
                });

                logger.info(`ЛС отправлено пользователю ${member.user.tag}`, {
                    userId: member.user.id,
                    adminId: interaction.user.id,
                    guildId: interaction.guildId
                });
            } else {
                await interaction.reply({
                    content: `❌ Не удалось отправить сообщение пользователю **${member.user.tag}** (возможно, ЛС закрыты).`,
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error('Ошибка в handleModal:', error);
            await interaction.reply({
                content: '❌ Произошла ошибка при отправке сообщения.',
                ephemeral: true
            });
        }
    }

    /**
     * Обработка: Восстановить ЧС
     */
    static async handleRestore(interaction, member, index) {
        try {
            await interaction.reply({
                content: '⚠️ Функция восстановления ЧС находится в разработке.\nДля повторной выдачи используйте команду `/чс`.',
                ephemeral: true
            });
        } catch (error) {
            logger.error('Ошибка в handleRestore:', error);
            await interaction.reply({
                content: '❌ Произошла ошибка.',
                ephemeral: true
            });
        }
    }

    /**
     * Обработка: История ЧС игрока
     */
    static async handleHistory(interaction, member) {
        try {
            const penalties = chsStore.get(member.user.id);

            if (!penalties || penalties.length === 0) {
                return interaction.reply({
                    content: `📜 У игрока **${member.user.tag}** нет истории ЧС.`,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(Colors.Gold)
                .setTitle(`📜 История ЧС игрока ${member.user.tag}`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

            penalties.forEach((p, index) => {
                            const chsInfo = CHS_TYPES[p.type] || { emoji: '⚪' };
            embed.addFields({
                name: `#${index + 1} ${chsInfo.emoji} ${p.type}`,
                value: `📅 Срок: \`${p.duration || 'Не указан'}\`\n📝 Причина: ${p.reason || 'Не указана'}\n👮 Выдал: ${p.moderator || 'Неизвестен'}\n📅 Дата: <t:${Math.floor((p.timestamp || Date.now()) / 1000)}:F>`,
                inline: false
            });
        });

        embed.setFooter({ text: `Всего записей: ${penalties.length}` }).setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    } catch (error) {
        logger.error('Ошибка в handleHistory:', error);
        await interaction.reply({
            content: '❌ Произошла ошибка при получении истории ЧС.',
            ephemeral: true
        });
    }
}

/**
 * Обработка: Заметка к ЧС
 */
static async handleNote(interaction, member) {
    try {
        // Проверяем, есть ли активные ЧС у игрока
        const penalties = chsStore.get(member.user.id);
        if (!penalties || penalties.length === 0) {
            return interaction.reply({
                content: `❌ У игрока **${member.user.tag}** нет активных ЧС, к которым можно добавить заметку.`,
                ephemeral: true
            });
        }

        // Создаём модальное окно для заметки
        const modal = new ModalBuilder()
            .setCustomId(`chs_note_modal_${member.user.id}`)
            .setTitle('📝 Добавить заметку');

        const noteInput = new TextInputBuilder()
            .setCustomId('note_text')
            .setLabel('Текст заметки')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Введите заметку...')
            .setRequired(true)
            .setMaxLength(500);

        const row = new ActionRowBuilder().addComponents(noteInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
    } catch (error) {
        logger.error('Ошибка в handleNote:', error);
        await interaction.reply({
            content: '❌ Произошла ошибка при создании модального окна для заметки.',
            ephemeral: true
        });
    }
}

/**
 * Обработка модального окна для заметки
 */
static async handleNoteModal(interaction) {
    try {
        if (!interaction.isModalSubmit()) return;

        const customId = interaction.customId;
        if (!customId.startsWith('chs_note_modal_')) return;

        const userId = customId.split('_')[3];
        if (!userId) {
            await interaction.reply({
                content: '❌ Ошибка: не указан ID пользователя.',
                ephemeral: true
            });
            return;
        }

        const noteText = interaction.fields.getTextInputValue('note_text');
        if (!noteText || noteText.trim().length === 0) {
            await interaction.reply({
                content: '❌ Заметка не может быть пустой!',
                ephemeral: true
            });
            return;
        }

        const member = await interaction.guild.members.fetch(userId);
        if (!member) {
            await interaction.reply({
                content: '❌ Пользователь не найден на сервере!',
                ephemeral: true
            });
            return;
        }

        // Получаем текущие ЧС и добавляем заметку к последнему
        const penalties = chsStore.get(userId);
        if (!penalties || penalties.length === 0) {
            await interaction.reply({
                content: `❌ У игрока **${member.user.tag}** нет активных ЧС.`,
                ephemeral: true
            });
            return;
        }

        const lastPenalty = penalties[penalties.length - 1];
        lastPenalty.note = noteText;
        
        // Обновляем запись
        chsStore.update(userId, penalties.length - 1, lastPenalty);

        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✅ Заметка добавлена')
            .setDescription(`К ЧС **${lastPenalty.type}** игрока **${member.user.tag}** добавлена заметка`)
            .addFields(
                { name: '📝 Заметка', value: noteText, inline: false },
                { name: '👮 Добавил', value: interaction.user.tag, inline: true },
                { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

        logger.info(`Заметка добавлена к ЧС пользователя ${member.user.tag}`, {
            userId: member.user.id,
            type: lastPenalty.type,
            adminId: interaction.user.id,
            guildId: interaction.guildId
        });
    } catch (error) {
        logger.error('Ошибка в handleNoteModal:', error);
        await interaction.reply({
            content: '❌ Произошла ошибка при добавлении заметки.',
            ephemeral: true
        });
    }
}

/**
 * Обработка: Предупреждение игрока
 */
static async handleWarn(interaction, member) {
    try {
        // Проверяем, есть ли уже предупреждения
        const penalties = chsStore.get(member.user.id);
        const warnCount = penalties ? penalties.filter(p => p.type === 'Предупреждение').length : 0;

        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('⚠️ Предупреждение')
            .setDescription(`Игроку **${member.user.tag}** выдано предупреждение`)
            .addFields(
                { name: '👮 Выдал', value: interaction.user.tag, inline: true },
                { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '⚠️ Количество', value: `${warnCount + 1} предупреждение(ий)`, inline: true }
            )
            .setFooter({ text: 'Следующее нарушение приведёт к ЧС' })
            .setTimestamp();

        // Добавляем предупреждение в хранилище
        const warningData = {
            type: 'Предупреждение',
            reason: 'Нарушение правил',
            moderator: interaction.user.tag,
            timestamp: Date.now(),
            duration: 'Предупреждение'
        };

        chsStore.add(member.user.id, warningData);

        await this.safeUpdate(interaction, {
            embeds: [embed],
            components: []
        });

        // Уведомляем игрока
        await this.safeDM(member, {
            content: `⚠️ Вы получили предупреждение от администратора **${interaction.user.tag}**.\nСледующее нарушение приведёт к выдаче ЧС.\n\nКоличество предупреждений: ${warnCount + 1}`
        });

        logger.info(`Предупреждение выдано пользователю ${member.user.tag}`, {
            userId: member.user.id,
            adminId: interaction.user.id,
            guildId: interaction.guildId,
            warnCount: warnCount + 1
        });
    } catch (error) {
        logger.error('Ошибка в handleWarn:', error);
        await interaction.reply({
            content: '❌ Произошла ошибка при выдаче предупреждения.',
            ephemeral: true
        });
    }
}

/**
 * Обработка: Статистика ЧС
 */
static async handleStats(interaction) {
    try {
        if (!this.checkStore()) {
            await interaction.reply({
                content: '❌ Ошибка инициализации системы ЧС!',
                ephemeral: true
            });
            return;
        }

        const allPenalties = chsStore.getAll();
        if (!allPenalties || Object.keys(allPenalties).length === 0) {
            await interaction.reply({
                content: '📊 На сервере нет активных ЧС.',
                ephemeral: true
            });
            return;
        }

        let totalPenalties = 0;
        const typeStats = {};
        const userStats = {};

        for (const [userId, penalties] of Object.entries(allPenalties)) {
            if (!penalties || penalties.length === 0) continue;
            
            totalPenalties += penalties.length;
            userStats[userId] = penalties.length;

            penalties.forEach(p => {
                typeStats[p.type] = (typeStats[p.type] || 0) + 1;
            });
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('📊 Статистика ЧС на сервере')
            .setDescription(`Всего активных ЧС: **${totalPenalties}**`)
            .addFields(
                { name: '📋 По типам', value: Object.entries(typeStats)
                    .map(([type, count]) => {
                        const chsInfo = CHS_TYPES[type] || { emoji: '⚪' };
                        return `${chsInfo.emoji} **${type}**: ${count}`;
                    })
                    .join('\n') || 'Нет данных', 
                    inline: false
                }
            )
            .setTimestamp();

        // Добавляем топ-5 нарушителей
        const sortedUsers = Object.entries(userStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);

        if (sortedUsers.length > 0) {
            let topUsers = '';
            for (const [userId, count] of sortedUsers) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    topUsers += `**${member.user.tag}**: ${count} ЧС\n`;
                } catch {
                    topUsers += `**Неизвестный пользователь** (${userId}): ${count} ЧС\n`;
                }
            }
            embed.addFields({ name: '🏆 Топ нарушителей', value: topUsers, inline: false });
        }

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    } catch (error) {
        logger.error('Ошибка в handleStats:', error);
        await interaction.reply({
            content: '❌ Произошла ошибка при получении статистики.',
            ephemeral: true
        });
    }
}

/**
 * Обработка: Экспорт данных
 */
static async handleExport(interaction) {
    try {
        if (!this.checkStore()) {
            await interaction.reply({
                content: '❌ Ошибка инициализации системы ЧС!',
                ephemeral: true
            });
            return;
        }

        const allPenalties = chsStore.getAll();
        if (!allPenalties || Object.keys(allPenalties).length === 0) {
            await interaction.reply({
                content: '📊 Нет данных для экспорта.',
                ephemeral: true
            });
            return;
        }

        // Формируем CSV
        let csv = 'Пользователь,Тип ЧС,Причина,Модератор,Дата,Срок,Заметка\n';
        
        for (const [userId, penalties] of Object.entries(allPenalties)) {
                if (!penalties || penalties.length === 0) continue;
                
                let userName = 'Неизвестный';
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    userName = member.user.tag;
                } catch {
                    // Игнорируем
                }

                penalties.forEach(p => {
                    const date = p.timestamp ? new Date(p.timestamp).toLocaleString() : 'Не указана';
                    csv += `"${userName}",${userId},"${p.type || 'Неизвестно'}","${(p.reason || 'Не указана').replace(/"/g, '""')}","${p.moderator || 'Неизвестен'}",${date},"${p.duration || 'Не указан'}","${(p.note || '').replace(/"/g, '""')}"\n`;
                });
            }

            // Отправляем файл
            const buffer = Buffer.from(csv, 'utf-8');
            await interaction.reply({
                content: '📊 Экспорт данных ЧС:',
                files: [{
                    attachment: buffer,
                    name: `chs_export_${Date.now()}.csv`
                }],
                ephemeral: true
            });

            logger.info('Экспорт данных ЧС выполнен', {
                guildId: interaction.guildId,
                adminId: interaction.user.id
            });
        } catch (error) {
            logger.error('Ошибка в handleExport:', error);
            await interaction.reply({
                content: '❌ Произошла ошибка при экспорте данных.',
                ephemeral: true
            });
        }
    }
                      }
