import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { chsStore } from '../../utils/chsStore.js';
import { CHSButtons } from '../../utils/chsButtons.js';

// ===== ВИДЫ ЧС =====
const CHS_TYPES = {
    'ЧСЛ': { label: 'ЧСЛ', emoji: '🔴', color: Colors.Red, description: 'Чрезвычайная ситуация локального уровня' },
    'ЧСП': { label: 'ЧСП', emoji: '🟠', color: Colors.Orange, description: 'Чрезвычайная ситуация природного характера' },
    'ЧСГОС': { label: 'ЧСГОС', emoji: '🟡', color: Colors.Gold, description: 'Чрезвычайная ситуация государственного уровня' },
    'ЧССС': { label: 'ЧССС', emoji: '🟢', color: Colors.Green, description: 'Чрезвычайная ситуация социального характера' }
};

export default {
    data: new SlashCommandBuilder()
        .setName('чс_список')
        .setDescription('Показать список всех активных ЧС на сервере')
        .addUserOption(option =>
            option.setName('игрок')
                .setDescription('Показать ЧС конкретного игрока')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('вид')
                .setDescription('Фильтр по виду ЧС')
                .setRequired(false)
                .addChoices(
                    { name: '🔴 ЧСЛ', value: 'ЧСЛ' },
                    { name: '🟠 ЧСП', value: 'ЧСП' },
                    { name: '🟡 ЧСГОС', value: 'ЧСГОС' },
                    { name: '🟢 ЧССС', value: 'ЧССС' }
                )
        )
        .addStringOption(option =>
            option.setName('сортировка')
                .setDescription('Сортировка списка')
                .setRequired(false)
                .addChoices(
                    { name: '📅 По дате (новые сверху)', value: 'date_desc' },
                    { name: '📅 По дате (старые сверху)', value: 'date_asc' },
                    { name: '📋 По виду ЧС', value: 'type' },
                    { name: '👤 По игроку (А-Я)', value: 'user_asc' },
                    { name: '👤 По игроку (Я-А)', value: 'user_desc' }
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    async execute(interaction) {
        // Обработка кнопок
        if (interaction.isButton()) {
            await CHSButtons.handleButton(interaction);
            return;
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ошибка отложенного ответа для команды чс_список`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            return;
        }

        // Получаем параметры
        const targetUser = interaction.options.getUser('игрок');
        const filterType = interaction.options.getString('вид');
        const sortType = interaction.options.getString('сортировка') || 'date_desc';

        // Получаем все ЧС
        const allPenalties = chsStore.getAll();
        
        if (allPenalties.size === 0) {
            return InteractionHelper.safeEditReply(interaction, {
                content: '✅ На сервере нет активных ЧС.',
                ephemeral: true
            });
        }

        // ===== СОБИРАЕМ ДАННЫЕ =====
        let penaltiesList = [];

        for (const [userId, penalties] of allPenalties) {
            // Фильтр по игроку
            if (targetUser && userId !== targetUser.id) continue;

            // Получаем информацию об игроке
            let member;
            try {
                member = await interaction.guild.members.fetch(userId);
            } catch (error) {
                // Если пользователь покинул сервер
                member = null;
            }

            const displayName = member ? member.displayName : `Покинул сервер (${userId})`;
            const avatarURL = member ? member.user.displayAvatarURL({ dynamic: true }) : null;

            penalties.forEach((penalty, index) => {
                // Фильтр по виду
                if (filterType && penalty.type !== filterType) return;

                const chsInfo = CHS_TYPES[penalty.type] || { emoji: '⚪', color: Colors.Grey };
                
                penaltiesList.push({
                    userId: userId,
                    displayName: displayName,
                    avatarURL: avatarURL,
                    penalty: penalty,
                    chsInfo: chsInfo,
                    index: index,
                    timestamp: penalty.timestamp || Date.now()
                });
            });
        }

        if (penaltiesList.length === 0) {
            let message = '✅ Нет активных ЧС';
            if (targetUser) message += ` у игрока **${targetUser.tag}**`;
            if (filterType) {
                const chsInfo = CHS_TYPES[filterType];
                message += ` с видом **${chsInfo ? chsInfo.emoji : ''} ${filterType}**`;
            }
            return InteractionHelper.safeEditReply(interaction, {
                content: message + '.',
                ephemeral: true
            });
        }

        // ===== СОРТИРОВКА =====
        switch (sortType) {
            case 'date_desc':
                penaltiesList.sort((a, b) => b.timestamp - a.timestamp);
                break;
            case 'date_asc':
                penaltiesList.sort((a, b) => a.timestamp - b.timestamp);
                break;
            case 'type':
                penaltiesList.sort((a, b) => a.penalty.type.localeCompare(b.penalty.type));
                break;
            case 'user_asc':
                penaltiesList.sort((a, b) => a.displayName.localeCompare(b.displayName));
                break;
            case 'user_desc':
                penaltiesList.sort((a, b) => b.displayName.localeCompare(a.displayName));
                break;
            default:
                penaltiesList.sort((a, b) => b.timestamp - a.timestamp);
        }

        // ===== ПАГИНАЦИЯ =====
        const itemsPerPage = 5;
        const totalPages = Math.ceil(penaltiesList.length / itemsPerPage);
        let currentPage = 0;

        // Функция создания embed для страницы
        const createPageEmbed = (page) => {
            const start = page * itemsPerPage;
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
                    const chsInfo = CHS_TYPES[type] || { emoji: '⚪' };
                    return `${chsInfo.emoji} **${type}**: ${count}`;
                })
                .join(' | ');

            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle('📋 Список активных ЧС')
                .setDescription(`Всего записей: **${penaltiesList.length}** | Страница ${page + 1}/${totalPages}`)
                .setFooter({ 
                    text: `Статистика: ${statsText}`,
                    iconURL: interaction.guild.iconURL()
                })
                .setTimestamp();

            // Если есть фильтр по игроку
            if (targetUser) {
                embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }));
                embed.setDescription(`ЧС игрока **${targetUser.tag}** (${penaltiesList.length} записей) | Страница ${page + 1}/${totalPages}`);
            }

            // Добавляем записи
            pageItems.forEach((item, idx) => {
                const p = item.penalty;
                const chsInfo = item.chsInfo;
                const globalIndex = start + idx + 1;

                let userDisplay = item.displayName;
                if (item.avatarURL) {
                    userDisplay = `[${item.displayName}](${item.avatarURL})`;
                }

                // Формируем строку с кнопкой для снятия
                const removeButton = `\`/чс_снять игрок:${p.moderatorId} вид:${p.type}\``;

                embed.addFields({
                    name: `#${globalIndex} ${chsInfo.emoji} ${p.type} — ${userDisplay}`,
                    value: `📅 Срок: \`${p.duration}\`\n📝 Причина: ${p.reason}\n👮 Выдал: ${p.moderator}\n📅 Дата: <t:${Math.floor(p.timestamp / 1000)}:F>\n🗑️ Снять: ${removeButton}`,
                    inline: false
                });
            });

            return embed;
        };

        // ===== КНОПКИ ПАГИНАЦИИ =====
        const getComponents = (page) => {
            const row = new ActionRowBuilder();

            if (totalPages > 1) {
                if (page > 0) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`chs_list_prev_${page}`)
                            .setLabel('◀️ Назад')
                            .setStyle(ButtonStyle.Primary)
                    );
                }

                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`chs_list_page_${page}`)
                        .setLabel(`📄 ${page + 1}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

                if (page < totalPages - 1) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`chs_list_next_${page}`)
                            .setLabel('Вперед ▶️')
                            .setStyle(ButtonStyle.Primary)
                    );
                }
            }

            // Кнопка обновления
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`chs_list_refresh`)
                    .setLabel('🔄 Обновить')
                    .setStyle(ButtonStyle.Success)
            );

            return [row];
        };

        // ===== ОТПРАВКА СООБЩЕНИЯ =====
        const embed = createPageEmbed(currentPage);
        const components = getComponents(currentPage);

        // Сохраняем состояние в коллекции для пагинации
        if (!interaction.client.chsListCache) {
            interaction.client.chsListCache = new Map();
        }
        const cacheKey = `${interaction.channelId}_${interaction.id}`;
        interaction.client.chsListCache.set(cacheKey, {
            penaltiesList: penaltiesList,
            totalPages: totalPages,
            currentPage: currentPage,
            targetUser: targetUser,
            filterType: filterType,
            sortType: sortType,
            messageId: null
        });

        const sentMessage = await interaction.channel.send({
            embeds: [embed],
            components: components
        });

        // Сохраняем ID сообщения
        const cacheData = interaction.client.chsListCache.get(cacheKey);
        cacheData.messageId = sentMessage.id;
        interaction.client.chsListCache.set(cacheKey, cacheData);

        // Ответ пользователю
        await InteractionHelper.safeEditReply(interaction, {
            content: `✅ Список ЧС отправлен в канал!`,
            ephemeral: true
        });

        logger.info(`Список ЧС показан`, {
            userId: interaction.user.id,
            count: penaltiesList.length,
            guildId: interaction.guildId
        });
    },

    // ===== ОБРАБОТКА КНОПОК ПАГИНАЦИИ =====
    async handlePagination(interaction) {
        const customId = interaction.customId;
        
        if (!customId.startsWith('chs_list_')) return false;

        const parts = customId.split('_');
        const action = parts[2];
        const page = parseInt(parts[3]);

        // Проверяем кеш
        const cacheKey = `${interaction.channelId}_${interaction.message.id}`;
        const cacheData = interaction.client.chsListCache?.get(cacheKey);
        
        if (!cacheData) {
            return interaction.reply({
                content: '❌ Список ЧС устарел. Используйте команду `/чс_список` заново.',
                ephemeral: true
            });
        }

        let newPage = cacheData.currentPage;

        if (action === 'next') {
            newPage = Math.min(page + 1, cacheData.totalPages - 1);
        } else if (action === 'prev') {
            newPage = Math.max(page - 1, 0);
        } else if (action === 'refresh') {
            newPage = cacheData.currentPage;
        } else {
            return false;
        }

        // Обновляем страницу
        cacheData.currentPage = newPage;

        // Создаём новый embed
        const start = newPage * 5;
        const end = Math.min(start + 5, cacheData.penaltiesList.length);
        const pageItems = cacheData.penaltiesList.slice(start, end);

        const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('📋 Список активных ЧС')
            .setDescription(`Всего записей: **${cacheData.penaltiesList.length}** | Страница ${newPage + 1}/${cacheData.totalPages}`)
            .setFooter({ 
                text: `Используйте /чс_снять для снятия ЧС`,
                iconURL: interaction.guild.iconURL()
            })
            .setTimestamp();

        if (cacheData.targetUser) {
            embed.setThumbnail(cacheData.targetUser.displayAvatarURL({ dynamic: true, size: 256 }));
            embed.setDescription(`ЧС игрока **${cacheData.targetUser.tag}** (${cacheData.penaltiesList.length} записей) | Страница ${newPage + 1}/${cacheData.totalPages}`);
        }

        // Добавляем записи
        pageItems.forEach((item, idx) => {
            const p = item.penalty;
            const chsInfo = item.chsInfo;
            const globalIndex = start + idx + 1;

            let userDisplay = item.displayName;
            if (item.avatarURL) {
                userDisplay = `[${item.displayName}](${item.avatarURL})`;
            }

            const removeButton = `\`/чс_снять игрок:${p.moderatorId} вид:${p.type}\``;

            embed.addFields({
                name: `#${globalIndex} ${chsInfo.emoji} ${p.type} — ${userDisplay}`,
                value: `📅 Срок: \`${p.duration}\`\n📝 Причина: ${p.reason}\n👮 Выдал: ${p.moderator}\n📅 Дата: <t:${Math.floor(p.timestamp / 1000)}:F>\n🗑️ Снять: ${removeButton}`,
                inline: false
            });
        });

        // Обновляем кнопки
        const row = new ActionRowBuilder();

        if (cacheData.totalPages > 1) {
            if (newPage > 0) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`chs_list_prev_${newPage}`)
                        .setLabel('◀️ Назад')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`chs_list_page_${newPage}`)
                    .setLabel(`📄 ${newPage + 1}/${cacheData.totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

            if (newPage < cacheData.totalPages - 1) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`chs_list_next_${newPage}`)
                        .setLabel('Вперед ▶️')
                        .setStyle(ButtonStyle.Primary)
                );
            }
        }

        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`chs_list_refresh`)
                .setLabel('🔄 Обновить')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.update({
            embeds: [embed],
            components: [row]
        });

        // Обновляем кеш
        interaction.client.chsListCache.set(cacheKey, cacheData);

        return true;
    }
};
