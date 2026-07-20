import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("тикет")  // Основная команда
        .setDescription("Управление системой тикетов на сервере.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("настройка")  // Подкоманда настройки
                .setDescription(
                    "Настройка панели создания тикетов в указанном канале.",
                )
                .addChannelOption((option) =>
                    option
                        .setName("канал_панели")
                        .setDescription(
                            "Канал, в который будет отправлена панель тикетов.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("текст_панели")
                        .setDescription(
                            "Основное сообщение/описание для панели тикетов.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("надпись_кнопки")
                        .setDescription(
                            "Текст на кнопке создания тикета (по умолчанию: Создать тикет)",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("категория")
                        .setDescription(
                            "Категория, в которой будут создаваться новые тикеты (необязательно).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("категория_закрытых")
                        .setDescription(
                            "Категория, в которую будут перемещаться закрытые тикеты (необязательно).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("роль_персонала")
                        .setDescription(
                            "Роль, которая будет иметь доступ к тикетам (необязательно).",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("макс_тикетов")
                        .setDescription("Максимальное количество тикетов на пользователя (по умолчанию: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("лс_при_закрытии")
                        .setDescription("Отправлять ЛС пользователю при закрытии тикета (по умолчанию: включено)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("панель")
                .setDescription("Открыть интерактивную панель управления системой тикетов"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        // Проверка прав
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Отказано в доступе к команде тикет', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'тикет'
            });
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Для этого действия требуется право `Manage Channels`.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "панель") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "настройка") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `На этом сервере уже настроена система тикетов (панель в <#${existingConfig.ticketPanelChannelId}>).\n\nНа сервере поддерживается только одна система тикетов. Используйте \`/тикет панель\` для редактирования существующей настройки, или выберите **Удалить систему** в панели управления, чтобы удалить её и настроить заново.` });
            }

            const panelChannel =
                interaction.options.getChannel("канал_панели");
            const categoryChannel = interaction.options.getChannel("категория");
            const closedCategoryChannel = interaction.options.getChannel("категория_закрытых");
            const staffRole = interaction.options.getRole("роль_персонала");
            const panelMessage = interaction.options.getString("текст_панели") || "Нажмите на кнопку ниже, чтобы создать тикет поддержки.";
            const buttonLabel =
                interaction.options.getString("надпись_кнопки") ||
                "Создать тикет";
            const maxTicketsPerUser = interaction.options.getInteger("макс_тикетов") || 3;
            const dmOnClose = interaction.options.getBoolean("лс_при_закрытии") !== false;

            const setupEmbed = createEmbed({ 
                title: "Тикеты поддержки", 
                description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                // Сохранение конфигурации
                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig || {};
                    currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                    currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                    currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnClose = dmOnClose;

                    await setGuildConfig(client, interaction.guildId, currentConfig);
                    logger.info('Конфигурация тикетов сохранена', {
                        guildId: interaction.guildId,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                    });
                } else {
                    logger.error('Настройка тикетов: база данных недоступна, панель отправлена, но конфигурация НЕ сохранена', {
                        guildId: interaction.guildId,
                    });
                }

                let successMessage = `Панель создания тикетов отправлена в ${panelChannel}.`;
                
                if (categoryChannel) {
                    successMessage += ` Новые тикеты будут создаваться в категории **${categoryChannel.name}**.`;
                } else {
                    successMessage += ' Новые тикеты будут создаваться в новой категории "Тикеты".';
                }
                
                if (closedCategoryChannel) {
                    successMessage += ` Закрытые тикеты будут перемещаться в **${closedCategoryChannel.name}**.`;
                }
                
                if (staffRole) {
                    successMessage += ` Роль **${staffRole.name}** будет иметь доступ к тикетам.`;
                }
                
                successMessage += `\n\n**Максимум тикетов на пользователя:** ${maxTicketsPerUser}\n**ЛС при закрытии:** ${dmOnClose ? 'Включено' : 'Отключено'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Панель тикетов настроена",
                            successMessage,
                        ),
                    ],
                });

                logger.info('Настройка панели тикетов завершена', {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guildId,
                    panelChannelId: panelChannel.id,
                    categoryId: categoryChannel?.id,
                    closedCategoryId: closedCategoryChannel?.id,
                    staffRoleId: staffRole?.id,
                    maxTickets: maxTicketsPerUser,
                    dmOnClose: dmOnClose,
                    commandName: 'тикет_настройка'
                });

                // Лог в канал аудита
                const logEmbed = createEmbed({
                    title: "Настройка системы тикетов (Лог конфигурации)",
                    description: `Панель тикетов настроена в ${panelChannel} пользователем ${interaction.user}.`,
                    color: getColor('warning')
                })
                    .addFields(
                        {
                            name: "Канал панели",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "Категория тикетов",
                            value: categoryChannel
                                ? categoryChannel.toString()
                                : "Не указана.",
                            inline: true,
                        },
                        {
                            name: "Категория закрытых",
                            value: closedCategoryChannel
                                ? closedCategoryChannel.toString()
                                : "Не указана.",
                            inline: true,
                        },
                        {
                            name: "Роль персонала",
                            value: staffRole
                                ? staffRole.toString()
                                : "Не указана.",
                            inline: true,
                        },
                        {
                            name: "Максимум тикетов",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "ЛС при закрытии",
                            value: dmOnClose ? 'Включено' : 'Отключено',
                            inline: true,
                        },
                        {
                            name: "Модератор",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

                // Отправка лога в канал аудита, если он настроен
                if (config?.auditLogChannelId) {
                    const auditChannel = interaction.guild.channels.cache.get(config.auditLogChannelId);
                    if (auditChannel?.type === ChannelType.GuildText) {
                        await auditChannel.send({ embeds: [logEmbed] }).catch(() => {});
                    }
                }

            } catch (error) {
                logger.error('Ошибка настройки тикетов', {
                    error: error.message,
                    stack: error.stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'тикет_настройка'
                });
                if (interaction.deferred || interaction.replied) {
                    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Не удалось отправить панель тикетов или сохранить конфигурацию. Проверьте права бота (особенно возможность отправлять сообщения в целевой канал) и подключение к базе данных.' }).catch(err => {
                        logger.error('Не удалось отправить ответ об ошибке', {
                            error: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionError(interaction, error, {
                        commandName: 'тикет_настройка',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
};
