import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    UserSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getGuildTicketStats } from '../../../utils/database/tickets.js';
import { getUserTicketCount } from '../../../services/ticket.js';
import {
    getTicketPanelStatus,
    messageHasButtonCustomId,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

// Создание ряда кнопок для панели управления
function buildButtonRow(guildConfig, guildId, disabled = false, panelStatus = null) {
    const dmEnabled = guildConfig.dmOnClose !== false;
    const showRepost = panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`ticket_cfg_repost_${guildId}`)
                .setLabel('Повторно опубликовать панель')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
                .setDisabled(disabled),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_dm_toggle_${guildId}`)
            .setLabel('ЛС при закрытии')
            .setStyle(dmEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji(dmEnabled ? '📬' : '📭')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_staff_role_btn_${guildId}`)
            .setLabel('Роль персонала')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🛡️')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_delete_${guildId}`)
            .setLabel('Удалить систему')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(disabled),
    );

    return new ActionRowBuilder().addComponents(buttons);
}

// Сохранение ID сообщения панели
async function persistPanelMessageId(client, guildId, guildConfig, messageId) {
    if (!messageId || guildConfig.ticketPanelMessageId === messageId) return;
    guildConfig.ticketPanelMessageId = messageId;
    if (client.db) {
        await setGuildConfig(client, guildId, guildConfig);
    }
}

// Создание embed для панели тикетов
function buildPanelEmbed(config) {
    return new EmbedBuilder()
        .setTitle('Тикеты поддержки')
        .setDescription(config.ticketPanelMessage || 'Нажмите на кнопку ниже, чтобы создать тикет поддержки.')
        .setColor(getColor('info'));
}

// Создание ряда кнопок для панели тикетов
function buildPanelButtonRow(config) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel(config.ticketButtonLabel || 'Создать тикет')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩'),
    );
}

// Повторная публикация панели тикетов
async function repostTicketPanel(client, guild, guildConfig, guildId) {
    const channel = await guild.channels.fetch(guildConfig.ticketPanelChannelId).catch(() => null);
    if (!channel) {
        throw new TitanBotError(
            'Канал панели отсутствует',
            ErrorTypes.CONFIGURATION,
            'Настроенный канал панели тикетов больше не существует. Установите новый канал панели через панель управления.',
        );
    }

    const sentPanel = await channel.send({
        embeds: [buildPanelEmbed(guildConfig)],
        components: [buildPanelButtonRow(guildConfig)],
    });

    await persistPanelMessageId(client, guildId, guildConfig, sentPanel.id);
    return sentPanel;
}

// Форматирование длительности закрытия
function formatCloseDuration(ms) {
    if (ms == null) return '`Н/Д`';
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}ч ${minutes}м`;
    return `${minutes}м`;
}

// Создание embed для панели управления
function buildDashboardEmbed(config, guild, panelStatus = null, ticketStats = null) {
    const panelChannel = config.ticketPanelChannelId ? `<#${config.ticketPanelChannelId}>` : '`Не установлен`';
    const staffRole = config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : '`Не установлена`';
    const ticketLogsChannel = config.ticketLogsChannelId ? `<#${config.ticketLogsChannelId}>` : '`Не установлен`';
    const transcriptChannel = config.ticketTranscriptChannelId ? `<#${config.ticketTranscriptChannelId}>` : '`Не установлен`';

    const openCategoryChannel = config.ticketCategoryId ? guild.channels.cache.get(config.ticketCategoryId) : null;
    const openCategory = openCategoryChannel ? openCategoryChannel.toString() : '`Не установлена`';
    
    const closedCategoryChannel = config.ticketClosedCategoryId ? guild.channels.cache.get(config.ticketClosedCategoryId) : null;
    const closedCategory = closedCategoryChannel ? closedCategoryChannel.toString() : '`Не установлена`';

    const rawMsg = config.ticketPanelMessage || 'Нажмите на кнопку ниже, чтобы создать тикет поддержки.';
    const panelMsg = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const btnLabel = `\`${config.ticketButtonLabel || 'Создать тикет'}\``;

    let panelStatusValue = formatPanelStatusField(panelStatus);

    const openTickets = ticketStats ? String(ticketStats.openCount) : '`—`';
    const avgCloseTime = ticketStats ? formatCloseDuration(ticketStats.avgCloseTimeMs) : '`—`';
    const feedbackSummary = ticketStats?.feedbackCount
        ? `${ticketStats.avgRating}/5 (${ticketStats.feedbackCount} оценк${ticketStats.feedbackCount !== 1 ? 'и' : 'а'})`
        : '`Нет оценок`';

    return new EmbedBuilder()
        .setTitle('🎫 Панель управления системой тикетов')
        .setDescription(`Управление настройками системы тикетов для **${guild.name}**.\nВыберите опцию ниже для изменения настройки.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Статус панели', value: panelStatusValue, inline: false },
            { name: 'Канал панели', value: panelChannel, inline: true },
            { name: 'Роль персонала', value: staffRole, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Категория открытых', value: openCategory, inline: true },
            { name: 'Категория закрытых', value: closedCategory, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Текст панели', value: panelMsg, inline: false },
            { name: 'Текст кнопки', value: btnLabel, inline: true },
            { name: 'Макс. тикетов', value: String(config.maxTicketsPerUser || 3), inline: true },
            { name: 'ЛС при закрытии', value: config.dmOnClose !== false ? 'Включено' : 'Отключено', inline: true },
            { name: 'Канал логов', value: ticketLogsChannel, inline: true },
            { name: 'Канал транскриптов', value: transcriptChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Открытых тикетов', value: openTickets, inline: true },
            { name: 'Среднее время', value: avgCloseTime, inline: true },
            { name: 'Рейтинг отзывов', value: feedbackSummary, inline: true },
        )
        .setFooter({ text: 'Выберите опцию ниже • Панель закроется через 10 минут бездействия' })
        .setTimestamp();
}

// Создание выпадающего меню
function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`ticket_config_${guildId}`)
        .setPlaceholder('Выберите настройку для изменения...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить текст панели')
                .setDescription('Изменить сообщение на панели создания тикетов')
                .setValue('panel_message')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить текст кнопки')
                .setDescription('Изменить надпись на кнопке создания тикета')
                .setValue('button_label')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить категорию открытых')
                .setDescription('Категория, где создаются новые тикеты')
                .setValue('open_category')
                .setEmoji('📁'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Изменить категорию закрытых')
                .setDescription('Категория, куда перемещаются закрытые тикеты')
                .setValue('closed_category')
                .setEmoji('📂'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Установить лимит тикетов')
                .setDescription('Ограничить количество открытых тикетов на пользователя')
                .setValue('max_tickets')
                .setEmoji('🔢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Установить канал логов')
                .setDescription('Канал для получения отзывов, событий и логов тикетов')
                .setValue('logs_channel')
                .setEmoji('🎫'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Установить канал транскриптов')
                .setDescription('Канал для получения транскриптов при удалении тикета')
                .setValue('transcript_channel')
                .setEmoji('📜'),
        );
}

// Обновление панели управления
async function refreshDashboard(rootInteraction, guildConfig, guildId, client) {
    const panelStatus = client
        ? await getTicketPanelStatus(client, rootInteraction.guild, guildConfig)
        : null;
    const ticketStats = client ? await getGuildTicketStats(guildId) : null;

    if (panelStatus?.recoveredId) {
        await persistPanelMessageId(client, guildId, guildConfig, panelStatus.recoveredId);
    }

    const buttonRow = buildButtonRow(guildConfig, guildId, false, panelStatus);
    const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(guildId));
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(guildConfig, rootInteraction.guild, panelStatus, ticketStats)],
        components: [buttonRow, selectRow],
    }).catch(() => {});
}

// Обновление живой панели тикетов
async function updateLivePanel(client, guild, config, guildId) {
    if (!config.ticketPanelChannelId) return false;
    try {
        const panelStatus = await getTicketPanelStatus(client, guild, config);
        if (panelStatus.recoveredId) {
            await persistPanelMessageId(client, guildId, config, panelStatus.recoveredId);
        }
        if (!panelStatus.exists || !panelStatus.message) return false;

        await panelStatus.message.edit({
            embeds: [buildPanelEmbed(config)],
            components: [buildPanelButtonRow(config)],
        });
        return true;
    } catch (error) {
        logger.warn('Не удалось обновить живую панель тикетов:', error.message);
        return false;
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);

            if (!guildConfig.ticketPanelChannelId) {
                throw new TitanBotError(
                    'Система тикетов не настроена',
                    ErrorTypes.CONFIGURATION,
                    'Система тикетов ещё не настроена. Сначала выполните `/тикет настройка` для конфигурации.',
                );
            }

            const panelStatus = await getTicketPanelStatus(client, interaction.guild, guildConfig);
            if (panelStatus.recoveredId) {
                await persistPanelMessageId(client, guildId, guildConfig, panelStatus.recoveredId);
            }

            const ticketStats = await getGuildTicketStats(guildId);

            const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(guildId));
            const buttonRow = buildButtonRow(guildConfig, guildId, false, panelStatus);

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(guildConfig, interaction.guild, panelStatus, ticketStats)],
                components: [buttonRow, selectRow],
                selectMenuId: `ticket_config_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `ticket_cfg_repost_${guildId}` ||
                    customId === `ticket_cfg_dm_toggle_${guildId}` ||
                    customId === `ticket_cfg_staff_role_btn_${guildId}` ||
                    customId === `ticket_cfg_delete_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'panel_message':
                            await handlePanelMessage(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'button_label':
                            await handleButtonLabel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'staff_role':
                            await handleStaffRole(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'open_category':
                            await handleOpenCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'closed_category':
                            await handleClosedCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'max_tickets':
                            await handleMaxTickets(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'logs_channel':
                            await handleLogsChannel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'transcript_channel':
                            await handleTranscriptChannel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    if (btnInteraction.customId === `ticket_cfg_repost_${guildId}`) {
                        await handleRepostPanel(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_dm_toggle_${guildId}`) {
                        await handleDmOnClose(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_staff_role_btn_${guildId}`) {
                        await handleStaffRole(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_delete_${guildId}`) {
                        await handleDeleteSystem(btnInteraction, interaction, guildConfig, guildId, client);
                    }
                },
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Неожиданная ошибка в ticket_config:', error);
            throw new TitanBotError(
                `Ошибка конфигурации тикетов: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Не удалось открыть панель управления конфигурацией тикетов.',
            );
        }
    },
};

// Обработчик изменения текста панели
async function handlePanelMessage(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_panel_msg')
        .setTitle('📝 Изменить текст панели')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_msg_input')
                    .setLabel('Текст панели')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(
                        guildConfig.ticketPanelMessage ||
                            'Нажмите на кнопку ниже, чтобы создать тикет поддержки.',
                    )
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Нажмите на кнопку ниже, чтобы создать тикет поддержки.'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_panel_msg' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newMessage = submitted.fields.getTextInputValue('panel_msg_input').trim();
    guildConfig.ticketPanelMessage = newMessage;
    await setGuildConfig(client, guildId, guildConfig);

    const panelUpdated = await updateLivePanel(client, rootInteraction.guild, guildConfig, guildId);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Текст панели обновлён',
                `Текст панели был обновлён.${
                    panelUpdated
                        ? '\nЖивая панель тикетов также была обновлена.'
                        : '\n> **Примечание:** Не удалось найти живую панель. Используйте **Повторно опубликовать панель** на панели управления для восстановления.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик изменения текста кнопки
async function handleButtonLabel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_btn_label')
        .setTitle('🏷️ Изменить текст кнопки')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('btn_label_input')
                    .setLabel('Текст кнопки (макс. 80 символов)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(guildConfig.ticketButtonLabel || 'Создать тикет')
                    .setMaxLength(80)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Создать тикет'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_btn_label' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newLabel = submitted.fields.getTextInputValue('btn_label_input').trim();
    guildConfig.ticketButtonLabel = newLabel;
    await setGuildConfig(client, guildId, guildConfig);

    const panelUpdated = await updateLivePanel(client, rootInteraction.guild, guildConfig, guildId);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Текст кнопки обновлён',
                `Текст кнопки изменён на \`${newLabel}\`.`${
                    panelUpdated
                        ? '\nКнопка на живой панели тикетов также была обновлена.'
                        : '\n> **Примечание:** Не удалось найти живую панель. Используйте **Повторно опубликовать панель** на панели управления для восстановления.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик изменения роли персонала
async function handleStaffRole(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('staff_role_select')
            .setPlaceholder('Выберите роль персонала...')
            .setDefaultRoles(guildConfig.ticketStaffRoleId ? [guildConfig.ticketStaffRoleId] : [])
    );

    await selectInteraction.reply({
        content: 'Выберите роль, которая будет иметь доступ к тикетам:',
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const collected = await selectInteraction.channel.awaitMessageComponent({
        filter: i => i.customId === 'staff_role_select' && i.user.id === selectInteraction.user.id,
        time: 60_000,
        componentType: ComponentType.RoleSelect,
    }).catch(() => null);

    if (!collected) {
        await selectInteraction.editReply({
            content: '⏰ Время выбора истекло.',
            components: [],
        });
        return;
    }

    const roleId = collected.values[0] || null;
    guildConfig.ticketStaffRoleId = roleId;
    await setGuildConfig(client, guildId, guildConfig);

    await collected.update({
        content: `✅ Роль персонала установлена на ${roleId ? `<@&${roleId}>` : 'отключена'}.`,
        components: [],
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик изменения категории открытых тикетов
async function handleOpenCategory(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('open_category_select')
            .setPlaceholder('Выберите категорию...')
            .addChannelTypes(ChannelType.GuildCategory)
            .setDefaultChannels(guildConfig.ticketCategoryId ? [guildConfig.ticketCategoryId] : [])
    );

    await selectInteraction.reply({
        content: 'Выберите категорию для новых тикетов:',
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const collected = await selectInteraction.channel.awaitMessageComponent({
        filter: i => i.customId === 'open_category_select' && i.user.id === selectInteraction.user.id,
        time: 60_000,
        componentType: ComponentType.ChannelSelect,
    }).catch(() => null);

    if (!collected) {
        await selectInteraction.editReply({
            content: '⏰ Время выбора истекло.',
            components: [],
        });
        return;
    }

    const categoryId = collected.values[0] || null;
    guildConfig.ticketCategoryId = categoryId;
    await setGuildConfig(client, guildId, guildConfig);

    await collected.update({
        content: `✅ Категория открытых тикетов установлена на ${categoryId ? `<#${categoryId}>` : 'отключена'}.`,
        components: [],
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик изменения категории закрытых тикетов
async function handleClosedCategory(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('closed_category_select')
            .setPlaceholder('Выберите категорию...')
            .addChannelTypes(ChannelType.GuildCategory)
            .setDefaultChannels(guildConfig.ticketClosedCategoryId ? [guildConfig.ticketClosedCategoryId] : [])
    );

    await selectInteraction.reply({
        content: 'Выберите категорию для закрытых тикетов:',
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const collected = await selectInteraction.channel.awaitMessageComponent({
        filter: i => i.customId === 'closed_category_select' && i.user.id === selectInteraction.user.id,
        time: 60_000,
        componentType: ComponentType.ChannelSelect,
    }).catch(() => null);

    if (!collected) {
        await selectInteraction.editReply({
            content: '⏰ Время выбора истекло.',
            components: [],
        });
        return;
    }

    const categoryId = collected.values[0] || null;
    guildConfig.ticketClosedCategoryId = categoryId;
    await setGuildConfig(client, guildId, guildConfig);

    await collected.update({
        content: `✅ Категория закрытых тикетов установлена на ${categoryId ? `<#${categoryId}>` : 'отключена'}.`,
        components: [],
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик изменения лимита тикетов
async function handleMaxTickets(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_max_tickets')
        .setTitle('🔢 Установить лимит тикетов')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('max_tickets_input')
                    .setLabel('Максимум тикетов на пользователя (1-10)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(guildConfig.maxTicketsPerUser || 3))
                    .setMaxLength(2)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('3'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_max_tickets' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const value = parseInt(submitted.fields.getTextInputValue('max_tickets_input').trim());
    if (isNaN(value) || value < 1 || value > 10) {
        await submitted.reply({
            embeds: [errorEmbed('Ошибка', 'Пожалуйста, введите число от 1 до 10.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    guildConfig.maxTicketsPerUser = value;
    await setGuildConfig(client, guildId, guildConfig);

    await submitted.reply({
        embeds: [successEmbed('✅ Лимит тикетов обновлён', `Максимум тикетов на пользователя установлен на **${value}**.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик изменения канала логов
async function handleLogsChannel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('logs_channel_select')
            .setPlaceholder('Выберите канал для логов...')
            .addChannelTypes(ChannelType.GuildText)
            .setDefaultChannels(guildConfig.ticketLogsChannelId ? [guildConfig.ticketLogsChannelId] : [])
    );

    await selectInteraction.reply({
        content: 'Выберите канал для логов тикетов:',
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const collected = await selectInteraction.channel.awaitMessageComponent({
        filter: i => i.customId === 'logs_channel_select' && i.user.id === selectInteraction.user.id,
        time: 60_000,
        componentType: ComponentType.ChannelSelect,
    }).catch(() => null);

    if (!collected) {
        await selectInteraction.editReply({
            content: '⏰ Время выбора истекло.',
            components: [],
        });
        return;
    }

    const channelId = collected.values[0] || null;
    guildConfig.ticketLogsChannelId = channelId;
    await setGuildConfig(client, guildId, guildConfig);

    await collected.update({
        content: `✅ Канал логов установлен на ${channelId ? `<#${channelId}>` : 'отключен'}.`,
        components: [],
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик изменения канала транскриптов
async function handleTranscriptChannel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('transcript_channel_select')
            .setPlaceholder('Выберите канал для транскриптов...')
            .addChannelTypes(ChannelType.GuildText)
            .setDefaultChannels(guildConfig.ticketTranscriptChannelId ? [guildConfig.ticketTranscriptChannelId] : [])
    );

    await selectInteraction.reply({
        content: 'Выберите канал для транскриптов:',
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const collected = await selectInteraction.channel.awaitMessageComponent({
        filter: i => i.customId === 'transcript_channel_select' && i.user.id === selectInteraction.user.id,
        time: 60_000,
        componentType: ComponentType.ChannelSelect,
    }).catch(() => null);

    if (!collected) {
        await selectInteraction.editReply({
            content: '⏰ Время выбора истекло.',
            components: [],
        });
        return;
    }

    const channelId = collected.values[0] || null;
    guildConfig.ticketTranscriptChannelId = channelId;
    await setGuildConfig(client, guildId, guildConfig);

    await collected.update({
        content: `✅ Канал транскриптов установлен на ${channelId ? `<#${channelId}>` : 'отключен'}.`,
        components: [],
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик повторной публикации панели
async function handleRepostPanel(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    await btnInteraction.deferUpdate();

    try {
        const sentPanel = await repostTicketPanel(client, rootInteraction.guild, guildConfig, guildId);
        
        await btnInteraction.followUp({
            embeds: [successEmbed('✅ Панель переопубликована', `Панель тикетов была успешно опубликована в ${sentPanel.channel}.`)],
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        await btnInteraction.followUp({
            embeds: [errorEmbed('Ошибка', `Не удалось переопубликовать панель: ${error.message}`)],
            flags: MessageFlags.Ephemeral,
        });
    }

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик переключения ЛС при закрытии
async function handleDmOnClose(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    await btnInteraction.deferUpdate();

    guildConfig.dmOnClose = guildConfig.dmOnClose !== false ? false : true;
    await setGuildConfig(client, guildId, guildConfig);

    await btnInteraction.followUp({
        embeds: [successEmbed('✅ Настройка обновлена', `ЛС при закрытии теперь **${guildConfig.dmOnClose !== false ? 'включено' : 'отключено'}**.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

// Обработчик удаления системы
async function handleDeleteSystem(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('confirm_delete')
            .setLabel('✅ Да, удалить')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('cancel_delete')
            .setLabel('❌ Отмена')
            .setStyle(ButtonStyle.Secondary),
    );

    await btnInteraction.reply({
        content: '⚠️ **Вы уверены, что хотите удалить всю систему тикетов?**\nЭто удалит панель и все настройки, но не затронет существующие каналы тикетов.',
        components: [confirmRow],
        flags: MessageFlags.Ephemeral,
    });

    const confirmation = await btnInteraction.channel.awaitMessageComponent({
        filter: i => i.user.id === btnInteraction.user.id && 
            (i.customId === 'confirm_delete' || i.customId === 'cancel_delete'),
        time: 30_000,
    }).catch(() => null);

    if (!confirmation) {
        await btnInteraction.editReply({
            content: '⏰ Время подтверждения истекло. Действие отменено.',
            components: [],
        });
        return;
    }

    if (confirmation.customId === 'cancel_delete') {
        await confirmation.update({
            content: '❌ Удаление отменено.',
            components: [],
        });
        return;
    }

    // Удаление конфигурации
    const deleteConfig = { ...guildConfig };
    deleteConfig.ticketPanelChannelId = null;
    deleteConfig.ticketPanelMessageId = null;
    deleteConfig.ticketPanelMessage = null;
    deleteConfig.ticketButtonLabel = null;
    deleteConfig.ticketCategoryId = null;
    deleteConfig.ticketClosedCategoryId = null;
    deleteConfig.ticketStaffRoleId = null;
    deleteConfig.ticketLogsChannelId = null;
    deleteConfig.ticketTranscriptChannelId = null;
    deleteConfig.maxTicketsPerUser = 3;
    deleteConfig.dmOnClose = true;

    await setGuildConfig(client, guildId, deleteConfig);

    await confirmation.update({
        content: '✅ Система тикетов успешно удалена. Вы можете настроить её заново с помощью `/тикет настройка`.',
        components: [],
    });

    // Закрываем панель управления
    await rootInteraction.deleteReply().catch(() => {});
            }
