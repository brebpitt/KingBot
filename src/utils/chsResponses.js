import { EmbedBuilder, Colors } from 'discord.js';

/**
 * Класс для готовых ответов на действия с ЧС
 */
export class CHSResponses {
    /**
     * Ответ: Успешная выдача ЧС
     */
    static successAdd(interaction, targetUser, chsType, duration, reason) {
        const chsInfo = this.getChsInfo(chsType);
        
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(`${chsInfo.emoji} ✅ ЧС успешно выдано!`)
            .setDescription(`Игроку **${targetUser.tag}** выдано ЧС **${chsType}**`)
            .addFields(
                { name: '📋 Вид ЧС', value: `${chsInfo.emoji} **${chsType}**`, inline: true },
                { name: '📅 Срок', value: `\`${duration}\``, inline: true },
                { name: '📝 Причина', value: reason, inline: false },
                { name: '👮 Выдал', value: interaction.user.tag, inline: true }
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: 'Пожалуйста, не нарушайте правила игры!' })
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Успешное снятие ЧС
     */
    static successRemove(interaction, targetUser, removedTypes, removeReason) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✅ ЧС успешно снято!')
            .setDescription(`С игрока **${targetUser.tag}** снято ЧС`)
            .addFields(
                { name: '📋 Снятые виды', value: removedTypes, inline: true },
                { name: '👮 Снял', value: interaction.user.tag, inline: true },
                { name: '📝 Причина снятия', value: removeReason || 'Не указана', inline: false }
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: 'ЧС успешно снято!' })
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Нет ЧС у игрока
     */
    static noPenalties(interaction, targetUser) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✅ Нет активных ЧС')
            .setDescription(`У игрока **${targetUser.tag}** нет активных ЧС.`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Информация о ЧС игрока
     */
    static infoPenalties(interaction, targetUser, penalties) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(`📋 Информация о ЧС игрока ${targetUser.tag}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setDescription(`Всего активных ЧС: **${penalties.length}**`);

        penalties.forEach((p, index) => {
            const chsInfo = this.getChsInfo(p.type);
            embed.addFields({
                name: `#${index + 1} ${chsInfo.emoji} ${p.type}`,
                value: `📅 Срок: \`${p.duration}\`\n📝 Причина: ${p.reason}\n👮 Выдал: ${p.moderator}\n📅 Дата: <t:${Math.floor(p.timestamp / 1000)}:F>`,
                inline: false
            });
        });

        embed.setFooter({ text: `ID игрока: ${targetUser.id}` }).setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Успешное предупреждение
     */
    static successWarn(interaction, targetUser) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('⚠️ Предупреждение выдано!')
            .setDescription(`Игроку **${targetUser.tag}** выдано предупреждение`)
            .addFields(
                { name: '👮 Выдал', value: interaction.user.tag, inline: true },
                { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: 'Следующее нарушение приведёт к ЧС' })
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Успешная отправка ЛС
     */
    static successDM(interaction, targetUser) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✉️ Сообщение отправлено!')
            .setDescription(`Сообщение успешно отправлено пользователю **${targetUser.tag}**`)
            .addFields(
                { name: '👮 Отправил', value: interaction.user.tag, inline: true },
                { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Ошибка - нет прав
     */
    static errorNoPermissions() {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Ошибка доступа')
            .setDescription('У вас нет прав для выполнения этого действия!')
            .setFooter({ text: 'Требуются права администратора' })
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Ошибка - пользователь не найден
     */
    static errorUserNotFound() {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Ошибка')
            .setDescription('Пользователь не найден на сервере!')
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Ошибка - нельзя выдать самому себе
     */
    static errorSelfPenalty() {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Ошибка')
            .setDescription('Нельзя выдать ЧС самому себе!')
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Ошибка - нельзя выдать боту
     */
    static errorBotPenalty() {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Ошибка')
            .setDescription('Нельзя выдать ЧС боту!')
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Ошибка - нельзя выдать администратору
     */
    static errorAdminPenalty() {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Ошибка')
            .setDescription('Нельзя выдать ЧС администратору!')
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Ошибка - неизвестный вид ЧС
     */
    static errorUnknownType() {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Ошибка')
            .setDescription('Неизвестный вид ЧС!')
            .addFields(
                { name: '📋 Доступные виды', value: '🔴 ЧСЛ\n🟠 ЧСП\n🟡 ЧСГОС\n🟢 ЧССС', inline: true }
            )
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Ошибка - неверный формат
     */
    static errorInvalidFormat() {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Ошибка формата')
            .setDescription('Неверный формат данных!')
            .addFields(
                { name: '📋 Правильный формат', value: '`/чс игрок:@Player вид:ЧСЛ срок:7д причина:Нарушение`', inline: false }
            )
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Команда в разработке
     */
    static errorInDevelopment() {
        const embed = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle('⚠️ В разработке')
            .setDescription('Эта функция находится в разработке!')
            .setFooter({ text: 'Скоро будет доступна' })
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Список ЧС (для пагинации)
     */
    static listPenalties(interaction, penaltiesList, currentPage, totalPages, targetUser = null, filterType = null) {
        const itemsPerPage = 5;
        const start = currentPage * itemsPerPage;
        const end = Math.min(start + itemsPerPage, penaltiesList.length);
        const pageItems = penaltiesList.slice(start, end);

        // Статистика
        const totalByType = {};
        penaltiesList.forEach(item => {
            const type = item.penalty.type;
            totalByType[type] = (totalByType[type] || 0) + 1;
        });

        const statsText = Object.entries(totalByType)
            .map(([type, count]) => {
                const chsInfo = this.getChsInfo(type);
                return `${chsInfo.emoji} **${type}**: ${count}`;
            })
            .join(' | ');

        const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('📋 Список активных ЧС')
            .setDescription(`Всего записей: **${penaltiesList.length}** | Страница ${currentPage + 1}/${totalPages}`)
            .setFooter({ 
                text: `Статистика: ${statsText}`,
                iconURL: interaction.guild.iconURL()
            })
            .setTimestamp();

        if (targetUser) {
            embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }));
            embed.setDescription(`ЧС игрока **${targetUser.tag}** (${penaltiesList.length} записей) | Страница ${currentPage + 1}/${totalPages}`);
        }

        if (filterType) {
            const chsInfo = this.getChsInfo(filterType);
            embed.setDescription(`${embed.data.description || ''}\nФильтр: ${chsInfo.emoji} **${filterType}**`);
        }

        // Добавляем записи
        pageItems.forEach((item, idx) => {
            const p = item.penalty;
            const chsInfo = this.getChsInfo(p.type);
            const globalIndex = start + idx + 1;

            const embedField = {
                name: `#${globalIndex} ${chsInfo.emoji} ${p.type} — ${item.displayName}`,
                value: `📅 Срок: \`${p.duration}\`\n📝 Причина: ${p.reason}\n👮 Выдал: ${p.moderator}\n📅 Дата: <t:${Math.floor(p.timestamp / 1000)}:F>`,
                inline: false
            };

            // Добавляем кнопку снятия только если есть права
            if (interaction.member.permissions.has('Administrator') || 
                interaction.member.roles.cache.has('ADMIN_ROLE_ID')) {
                embedField.value += `\n🗑️ Снять: \`/чс_снять игрок:${p.moderatorId} вид:${p.type}\``;
            }

            embed.addFields(embedField);
        });

        if (pageItems.length === 0) {
            embed.setDescription('📭 Нет записей на этой странице');
        }

        return { embeds: [embed] };
    }

    /**
     * Ответ: Успешное обновление списка
     */
    static successRefresh(interaction) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('🔄 Список обновлён!')
            .setDescription('Список ЧС успешно обновлён!')
            .setTimestamp();

        return { embeds: [embed] };
    }

    /**
     * Ответ: Пустой список
     */
    static emptyList(interaction) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('📭 Нет активных ЧС')
            .setDescription('На сервере нет активных ЧС.')
            .setTimestamp();

        return { embeds: [embed] };
    }

    /**
     * Ответ: ЛС отправлено игроку (в модальном окне)
     */
    static dmSent(interaction, targetUser) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✉️ Сообщение отправлено!')
            .setDescription(`✅ Сообщение успешно отправлено пользователю **${targetUser.tag}**!`)
            .addFields(
                { name: '👮 Отправил', value: interaction.user.tag, inline: true },
                { name: '📅 Время', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Ошибка отправки ЛС
     */
    static errorDMSend(interaction, targetUser) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Ошибка отправки')
            .setDescription(`Не удалось отправить сообщение пользователю **${targetUser.tag}**`)
            .addFields(
                { name: '💡 Возможные причины', value: '• ЛС пользователя закрыты\n• Пользователь покинул сервер\n• Бот не имеет прав', inline: false }
            )
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Ответ: Ошибка - список устарел
     */
    static errorListOutdated() {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Список устарел')
            .setDescription('Список ЧС устарел. Используйте команду `/чс_список` заново.')
            .setTimestamp();

        return { embeds: [embed], ephemeral: true };
    }

    /**
     * Вспомогательный метод: получить информацию о виде ЧС
     */
    static getChsInfo(type) {
        const types = {
            'ЧСЛ': { label: 'ЧСЛ', emoji: '🔴', color: Colors.Red },
            'ЧСП': { label: 'ЧСП', emoji: '🟠', color: Colors.Orange },
            'ЧСГОС': { label: 'ЧСГОС', emoji: '🟡', color: Colors.Gold },
            'ЧССС': { label: 'ЧССС', emoji: '🟢', color: Colors.Green }
        };
        return types[type] || { label: type, emoji: '⚪', color: Colors.Grey };
    }

    /**
     * Универсальный метод для отправки ответа
     */
    static async send(interaction, responseData) {
        try {
            if (interaction.deferred) {
                await interaction.editReply(responseData);
            } else if (interaction.replied) {
                await interaction.followUp(responseData);
            } else {
                await interaction.reply(responseData);
            }
            return true;
        } catch (error) {
            console.error('Ошибка отправки ответа:', error);
            return false;
        }
    }

    /**
     * Универсальный метод для обновления сообщения
     */
    static async update(interaction, responseData) {
        try {
            await interaction.update(responseData);
            return true;
        } catch (error) {
            console.error('Ошибка обновления сообщения:', error);
            return false;
        }
    }
                       }
