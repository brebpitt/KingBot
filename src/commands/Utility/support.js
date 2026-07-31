import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits, 
    ChannelType 
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// ===== НАСТРОЙКИ =====
const ADMIN_ROLE_ID = '1510803430166495295'; // ID роли администрации

export default {
    // Конструктор СЛЭШ-КОМАНДЫ
    data: new SlashCommandBuilder()
        .setName('поддержка')
        .setDescription('Отправить панель поддержки KING MOBILE')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('заголовок')
                .setDescription('Заголовок панели')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('текст')
                .setDescription('Текст или инструкция')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('цвет')
                .setDescription('HEX-цвет (например: #3498db или #ff0000)')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('канал')
                .setDescription('Канал для отправки панели')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    async execute(interaction) {
        // Если вызвали КНОПКУ внутри тикета или панели
        if (interaction.isButton()) {
            await this.handleButton(interaction);
            return;
        }

        // Если это СЛЭШ-КОМАНДА /поддержка
        if (interaction.isChatInputCommand()) {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, true);
            if (!deferSuccess) return;

            const title = interaction.options.getString('заголовок');
            const text = interaction.options.getString('текст');
            let color = interaction.options.getString('цвет');
            const targetChannel = interaction.options.getChannel('канал');

            if (!color.startsWith('#')) {
                color = `#${color}`;
            }

            try {
                const mainEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(text)
                    .setColor(color)
                    .setFooter({ text: 'Поддержка сервера KING MOBILE' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_create')
                        .setLabel('🗃️ Создать обращение')
                        .setStyle(ButtonStyle.Primary)
                );

                await targetChannel.send({ embeds: [mainEmbed], components: [row] });

                await InteractionHelper.safeEditReply(interaction, {
                    content: `✅ Панель поддержки успешно отправлена в канал ${targetChannel}!`
                });

            } catch (error) {
                logger.error(`Ошибка отправки панели поддержки:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    content: `❌ Не удалось отправить эмбед. Убедитесь, что цвет передан корректно (например #3498db).`
                });
            }
        }
    },

    // ===== ОБРАБОТКА КНОПОК =====
    async handleButton(interaction) {
        const { customId, guild, user, channel } = interaction;

        // Создать обращение
        if (customId === 'ticket_create') {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, true);
            if (!deferSuccess) return;

            try {
                const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
                const channelName = `ticket-${cleanUsername}`;

                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        },
                        {
                            id: ADMIN_ROLE_ID,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        }
                    ]
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('Тикет создан!')
                    .setColor('#2b2d31')
                    .addFields(
                        { name: 'Создал:', value: `${user}`, inline: true },
                        { name: 'Дата открытия:', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setFooter({ text: 'Поддержка сервера KING MOBILE' });

                const ticketRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_claim')
                        .setLabel('👤 Взять обращение')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('ticket_close')
                        .setLabel('🔐 Закрыть тикет')
                        .setStyle(ButtonStyle.Danger)
                );

                await ticketChannel.send({
                    content: `${user}, Ваше обращение создано! Опишите возникшую проблему.`,
                    embeds: [ticketEmbed],
                    components: [ticketRow]
                });

                await InteractionHelper.safeEditReply(interaction, {
                    content: `✅ Ваш тикет создан: ${ticketChannel}`
                });

                // Авто-удаление через 24 часа
                setTimeout(async () => {
                    try {
                        const fetchedChannel = await guild.channels.fetch(ticketChannel.id).catch(() => null);
                        if (fetchedChannel) {
                            await fetchedChannel.delete('Авто-удаление через 24 часа');
                            logger.info(`Тикет ${ticketChannel.id} автоматически удален через 24ч.`);
                        }
                    } catch (err) {
                        logger.error(`Ошибка авто-удаления тикета:`, err);
                    }
                }, 86_400_000);

            } catch (error) {
                logger.error(`Ошибка создания тикета:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    content: `❌ Ошибка при создании тикета.`
                });
            }
        }

        // Взять обращение
        if (customId === 'ticket_claim') {
            const member = interaction.member;
            const hasAdminRole = member.roles.cache.has(ADMIN_ROLE_ID);
            const hasAdminPerms = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPerms) {
                return interaction.reply({
                    content: '❌ У вас нет прав для обработки тикетов!',
                    ephemeral: true
                });
            }

            const originalEmbed = interaction.message.embeds[0];
            const creatorField = originalEmbed?.fields?.find(f => f.name === 'Создал:');
            const creatorMention = creatorField ? creatorField.value : 'Пользователь';

            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_claim')
                    .setLabel('👤 Взято')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('🔐 Закрыть тикет')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.update({ components: [updatedRow] });
            await channel.send({ content: `${creatorMention} тикет взят ${user}` });
        }

        // Закрыть тикет
        if (customId === 'ticket_close') {
            await interaction.reply({ content: '🔐 Тикет будет удален через 5 секунд...' });
            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    logger.error(`Ошибка удаления канала:`, error);
                }
            }, 5000);
        }
    }
};
                                          
