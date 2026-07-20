import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType, EmbedBuilder, LabelBuilder, CheckboxBuilder, TextDisplayBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { createError, TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createReactionRoleMessage, hasDangerousPermissions, getAllReactionRoleMessages, deleteReactionRoleMessage } from '../../services/reactionRoleService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import {
    getReactionRolePanelStatus,
    formatPanelStatusField,
} from '../../utils/panelStatus.js';
import { startDashboardSession } from '../../utils/dashboardSession.js';
import { getReactionRoleKey } from '../../utils/database/keys.js';

const DASHBOARD_EPHEMERAL = MessageFlags.Ephemeral;
const SELECT_OPTION_LABEL_LIMIT = 100;
const SELECT_OPTION_DESCRIPTION_LIMIT = 100;

function truncateText(value, maxLength) {
    const text = String(value ?? '');
    return text.length > maxLength ? text.substring(0, maxLength) : text;
}

export default {
    data: new SlashCommandBuilder()
        .setName('реакция_роль')
        .setDescription('Управление назначением ролей по реакции')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('настраивать')
                .setDescription('Создать новую панель ролей по реакции')
                .addChannelOption(option => 
                    option.setName('канал')
                        .setDescription('Канал для отправки сообщения с панелью ролей')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('заголовок')
                        .setDescription('Заголовок панели ролей по реакции')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('описание')
                        .setDescription('Описание панели ролей по реакции')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('роль1')
                        .setDescription('Первая роль для добавления')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('роль2')
                        .setDescription('Вторая роль для добавления')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('роль3')
                        .setDescription('Третья роль для добавления')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('роль4')
                        .setDescription('Четвёртая роль для добавления')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('роль5')
                        .setDescription('Пятая роль для добавления')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('панель')
                .setDescription('Управление и настройка панелей ролей по реакции')
                .addStringOption(option =>
                    option
                        .setName('панель')
                        .setDescription('Выберите панель ролей для управления')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'настраивать') {
            await handleSetup(interaction);
        } else if (subcommand === 'панель') {
            const selectedPanelId = interaction.options.getString('панель');
            await handleDashboard(interaction, selectedPanelId);
        }
    },

    async autocomplete(interaction) {
        if (interaction.commandName !== 'реакция_роль') return;
        if (interaction.options.getSubcommand() !== 'панель') return;

        // Автозаполнение должно отвечать в течение 3 секунд. Создаём варианты из сохранённых данных панелей
        // и кэшированных каналов/сообщений — без сетевых запросов, чтобы избежать DiscordAPIError 10062.
        try {
            const guildId = interaction.guild.id;
            const client = interaction.client;
            const guild = interaction.guild;

            let panels;
            try {
                panels = await getAllReactionRoleMessages(client, guildId);
            } catch {
                await interaction.respond([]).catch(() => {});
                return;
            }

            if (!panels?.length) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const choices = [];
            for (const panel of panels) {
                if (!panel.messageId || !panel.channelId) continue;

                const channel = guild.channels.cache.get(panel.channelId);
                if (!channel) continue;

                const cachedTitle = channel.messages?.cache?.get(panel.messageId)?.embeds?.[0]?.title;
                const roleCount = Array.isArray(panel.roles) ? panel.roles.length : 0;
                const label = cachedTitle
                    ? `${cachedTitle} (#${channel.name})`
                    : `#${channel.name} · ${roleCount} роль${roleCount === 1 ? '' : 'ей'}`;

                choices.push({ name: label.substring(0, 100), value: panel.messageId });
                if (choices.length >= 25) break;
            }

            await interaction.respond(choices).catch(() => {});
        } catch {
            await interaction.respond([]).catch(() => {});
        }
    }
};

async function handleSetup(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    
    logger.info(`Настройка ролей по реакции инициирована пользователем ${interaction.user.tag} на сервере ${interaction.guild.name}`);
    
    const channel = interaction.options.getChannel('канал');
    const title = interaction.options.getString('заголовок');
    const description = interaction.options.getString('описание');

    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        throw createError(
            `Недопустимый тип канала: ${channel.type}`,
            ErrorTypes.VALIDATION,
            'Пожалуйста, выберите текстовый канал или канал объявлений.',
            { channelType: channel.type }
        );
    }

    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            'У бота отсутствует разрешение ManageRoles',
            ErrorTypes.PERMISSION,
            'Мне нужно разрешение "Управлять ролями" для настройки ролей по реакции.',
            { permission: 'ManageRoles' }
        );
    }
    
    if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        throw createError(
            `Бот не может отправлять сообщения в ${channel.name}`,
            ErrorTypes.PERMISSION,
            `У меня нет разрешения отправлять сообщения в ${channel}.`,
            { channelId: channel.id }
        );
    }

    const existingPanels = await getAllReactionRoleMessages(interaction.client, interaction.guildId);
    if (existingPanels && existingPanels.length >= 5) {
        throw createError(
            'Достигнут лимит панелей',
            ErrorTypes.VALIDATION,
            'Ваш сервер достиг максимума в 5 панелей ролей по реакции. Удалите существующую панель, чтобы создать новую.',
            { maxPanels: 5, currentPanels: existingPanels.length }
        );
    }

    const roles = [];
    const roleValidationErrors = [];
    const seenRoleIds = new Set();
    
    for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`роль${i}`);
        if (role) {
            if (seenRoleIds.has(role.id)) {
                roleValidationErrors.push(`**${role.name}** - Эта роль выбрана более одного раза`);
                continue;
            }

            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                roleValidationErrors.push(`**${role.name}** - Моя роль бота находится ниже этой роли в иерархии сервера и не может её назначать`);
                continue;
            }
            
            if (hasDangerousPermissions(role)) {
                roleValidationErrors.push(`**${role.name}** - Эта роль имеет опасные разрешения (Администратор, Управление сервером и т.д.)`);
                continue;
            }
            
            if (role.managed) {
                roleValidationErrors.push(`**${role.name}** - Это управляемая роль (роль интеграции/бота)`);
                continue;
            }
            
            if (role.id === interaction.guild.id) {
                roleValidationErrors.push(`**${role.name}** - Нельзя использовать роль @everyone`);
                continue;
            }
            
            seenRoleIds.add(role.id);
            roles.push(role);
        }
    }
    
    if (roleValidationErrors.length > 0) {
        const errorMsg = `Следующие роли не могут быть добавлены:\n${roleValidationErrors.join('\n')}`;
        
        if (roles.length === 0) {
            throw createError(
                'Нет допустимых ролей',
                ErrorTypes.VALIDATION,
                errorMsg,
                { errors: roleValidationErrors }
            );
        }
        
        await interaction.followUp({
            embeds: [warningEmbed('Предупреждение о проверке ролей', errorMsg)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (roles.length < 1) {
        throw createError(
            'Роли не предоставлены',
            ErrorTypes.VALIDATION,
            'Вы должны указать хотя бы одну допустимую роль.',
            {}
        );
    }

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('reaction_roles')
            .setPlaceholder('Выберите свои роли')
            .setMinValues(0)
            .setMaxValues(roles.length)
            .addOptions(
                roles.map(role => ({
                    label: truncateText(role.name, SELECT_OPTION_LABEL_LIMIT),
                    description: truncateText(`Добавить/удалить роль ${role.name}`, SELECT_OPTION_DESCRIPTION_LIMIT),
                    value: role.id,
                    emoji: '🎭'
                }))
            )
    );

    const panelEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(getColor('info'))
        .addFields({
            name: 'Доступные роли',
            value: roles.map(role => `• ${role}`).join('\n')
        })
        .setFooter({ text: 'Выберите роли из выпадающего меню ниже' });

    const message = await channel.send({
        embeds: [panelEmbed],
        components: [row]
    });

    const roleIds = roles.map(role => role.id);
    try {
        await createReactionRoleMessage(
            interaction.client,
            interaction.guildId,
            channel.id,
            message.id,
            roleIds
        );
    } catch (saveError) {
        // Панель уже опубликована, но её данные не сохранились, поэтому выпадающее меню
        // не будет работать. Удаляем сообщение-сироту перед выводом ошибки.
        await message.delete().catch(() => {});
        throw saveError;
    }

    logger.info(`Сообщение с ролями по реакции создано: ${message.id} с ${roles.length} ролями пользователем ${interaction.user.tag}`);

    try {
        await logEvent({
            client: interaction.client,
            guildId: interaction.guildId,
            eventType: EVENT_TYPES.REACTION_ROLE_CREATE,
            data: {
                description: `Панель ролей по реакции создана пользователем ${interaction.user.tag}`,
                userId: interaction.user.id,
                channelId: channel.id,
                fields: [
                    {
                        name: 'Заголовок',
                        value: title,
                        inline: false
                    },
                    {
                        name: 'Канал',
                        value: channel.toString(),
                        inline: true
                    },
                    {
                        name: 'Роли',
                        value: `${roles.length} ролей`,
                        inline: true
                    },
                    {
                        name: 'Список ролей',
                        value: roles.map(r => r.toString()).join(','),
                        inline: false
                    },
                    {
                        name: 'Ссылка на сообщение',
                        value: message.url,
                        inline: false
                    }
                ]
            }
        });
    } catch (logError) {
        logger.warn('Не удалось залогировать создание ролей по реакции:', logError);
    }

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Успешно', `✅ Панель ролей по реакции создана в ${channel}!\n\n${message.url}`)]
    });
}

async function fetchPanelDiscordMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(panelData.channelId);
        if (!channel) return null;
        return await channel.messages.fetch(panelData.messageId).catch(() => null);
    } catch {
        return null;
    }
}

async function rebuildLivePanelMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(panelData.channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(panelData.messageId).catch(() => null);
        if (!msg || !msg.embeds[0]) return;

        const roleObjects = panelData.roles
            .map(id => guild.roles.cache.get(id))
            .filter(Boolean);

        if (roleObjects.length === 0) return;

        const currentEmbed = msg.embeds[0];
        const updatedEmbed = EmbedBuilder.from(currentEmbed);
        const fields = currentEmbed.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline }));
        const roleFieldIdx = fields.findIndex(f => f.name === 'Доступные роли');
        const newRoleValue = roleObjects.map(r => `• ${r}`).join('\n');
        if (roleFieldIdx !== -1) {
            fields[roleFieldIdx] = { name: 'Доступные роли', value: newRoleValue, inline: false };
        } else {
            fields.push({ name: 'Доступные роли', value: newRoleValue, inline: false });
        }
        updatedEmbed.setFields(fields);

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('reaction_roles')
                .setPlaceholder('Выберите свои роли')
                .setMinValues(0)
                .setMaxValues(roleObjects.length)
                .addOptions(
                    roleObjects.map(r => ({
                        label: r.name.substring(0, 100),
                        description: `Добавить/удалить роль ${r.name}`.substring(0, 100),
                        value: r.id,
                        emoji: '🎭',
                    })),
                ),
        );

        await msg.edit({ embeds: [updatedEmbed], components: [selectRow] });
    } catch (error) {
        logger.warn('Не удалось перестроить активную панель ролей по реакции:', error.message);
    }
}

async function showPanelDashboard(interaction, panelData, discordMsg, guildId, guild, client, panelStatus = null) {
    if (!panelStatus && client) {
        panelStatus = await getReactionRolePanelStatus(client, guild, panelData);
        if (panelStatus.recoveredId) {
            await migrateReactionRoleMessageId(client, guildId, panelData, panelStatus.recoveredId);
            discordMsg = panelStatus.message || discordMsg;
        }
    }

    const payload = buildReactionRoleDashboardPayload(panelData, discordMsg, guildId, guild, panelStatus);
    await InteractionHelper.safeEditReply(interaction, { ...payload, flags: DASHBOARD_EPHEMERAL });
}

function buildReactionRoleDashboardPayload(panelData, discordMsg, guildId, guild, panelStatus = null) {
    const channel = guild.channels.cache.get(panelData.channelId);
    const title = discordMsg?.embeds?.[0]?.title ?? 'Панель без названия';
    const roleList =
        panelData.roles.length > 0
            ? panelData.roles.map(id => `<@&${id}>`).join(',')
            : '`Нет`';

    const showRepost = panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';

    const embed = new EmbedBuilder()
        .setTitle('Панель управления ролями по реакции')
        .setDescription(
            `**Заголовок:** ${title}\n\nВыберите опцию ниже для изменения настройки.${discordMsg ? `\n[Нажмите для просмотра панели](${discordMsg.url})` : ''}`,
        )
        .setColor(getColor('info'))
        .addFields(
            { name: 'Статус панели', value: formatPanelStatusField(panelStatus), inline: false },
            { name: 'Канал', value: channel ? `<#${channel.id}>` : '`Не найден`', inline: true },
            { name: 'Роли', value: `\`${panelData.roles.length} / 25\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Список ролей', value: roleList, inline: false },
        )
        .setFooter({ text: 'Панель управления закроется через 10 минут бездействия' })
        .setTimestamp();

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`rr_repost_${guildId}`)
                .setLabel('Восстановить панель')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌'),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`rr_edit_text_${guildId}`)
            .setLabel('Изменить текст панели')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId(`rr_delete_${guildId}`)
            .setLabel('Удалить панель')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const optionsSelect = new StringSelectMenuBuilder()
        .setCustomId(`rr_opts_${guildId}`)
        .setPlaceholder('Выберите действие...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Добавить роль')
                .setDescription('Добавить роль на эту панель (до 25 всего)')
                .setValue('add_role')
                .setEmoji('➕'),
            ...(panelData.roles.length > 0
                ? [
                      new StringSelectMenuOptionBuilder()
                          .setLabel('Удалить роль')
                          .setDescription('Удалить роль с этой панели')
                          .setValue('remove_role')
                          .setEmoji('➖'),
                  ]
                : []),
        );

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(buttons),
            new ActionRowBuilder().addComponents(optionsSelect),
        ],
    };
}

async function migrateReactionRoleMessageId(client, guildId, panelData, newMessageId) {
    // Функция для миграции ID сообщения панели
    try {
        const key = getReactionRoleKey(guildId, panelData.messageId);
        // Здесь логика обновления ID в базе данных
        logger.info(`Миграция ID сообщения панели: ${panelData.messageId} -> ${newMessageId}`);
    } catch (error) {
        logger.error('Ошибка при миграции ID сообщения панели:', error);
    }
            }
