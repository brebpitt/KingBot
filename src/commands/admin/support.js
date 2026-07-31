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
    data: new SlashCommandBuilder()
        .setName('поддержка')
        .setDescription('Отправить панель поддержки сервера KING MOBILE')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('заголовок')
                .setDescription('Заголовок обращения')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('текст')
                .setDescription('Основной текст или инструкция')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('цвет')
                .setDescription('Цвет эмбеда в HEX (например: #FF6B00 или #3498db)')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('канал')
                .setDescription('Канал для отправки панели поддержки')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),
    

    async execute(interaction) {
        // 1. Если кликнули по кнопке
        if (interaction.isButton()) {
            await this.handleButton(interaction);
            return;
        }

        // 2. Выполнение слэш-команды /поддержка
        const deferSuccess = await InteractionHelper.safeDefer(interaction, true);
        if (!deferSuccess) {
            logger.warn(`Ошибка отложенного ответа для команды поддержки`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            return;
        }

        const title = interaction.options.getString('заголовок');
        const text = interaction.options.getString('текст');
        let color = interaction.options.getString('цвет');
        const targetChannel = interaction.options.getChannel('канал');

        // Подгоняем HEX цвет
        if (!color.startsWith('#')) {
            color = `#${color}`;
        }

        try {
            const supportEmbed = new EmbedBuilder()
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

            await targetChannel.send({
                embeds: [supportEmbed],
                components: [row]
            });

            await InteractionHelper.safeEditReply(interaction, {
                content: `✅ Панель поддержки успешно отправлена в ${targetChannel}!`
            });

            logger.info(`Панель поддержки отправлена`, {
                adminId: interaction.user.id,
                channelId: targetChannel.id,
                guildId: interaction.guildId
            });

        } catch (error) {
            logger.error(`Ошибка при отправке панели поддержки:`, error);
            await InteractionHelper.safeEditReply(interaction, {
                content: `❌ Не удалось отправить панель. Проверьте формат цвета (пример: #3498db).`
            });
        }
    },

    // ===== ОБРАБОТКА КНОПОК =====
    async handleButton(interaction) {
        const { customId, guild, user, channel } = interaction;

        // --- СОЗДАНИЕ ТИКЕТА ---
        if (customId === 'ticket_create') {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, true);
            if (!deferSuccess) return;

            try {
                const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
                const channelName = `ticket-${cleanUsername}`;

                // Создаем закрытый канал тикета
                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.id, // Закрываем от всех
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: user.id, // Открываем создателю
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        },
                        {
                            id: ADMIN_ROLE_ID, // Открываем администрации
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
                    .setFooter({ text: 'Поддержка сервера KING MOBILE' })
                    .setTimestamp();

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
                    content: `Приветствуем ${user}! Опишите вашу проблему, администрация ответит в ближайшее время.`,
                    embeds: [ticketEmbed],
                    components: [ticketRow]
                });

                await InteractionHelper.safeEditReply(interaction, {
                    content: `✅ Ваш тикет создан: ${ticketChannel}`
                });

                logger.info(`Тикет создан`, { userId: user.id, channelId: ticketChannel.id });

                // Автоматическое удаление канала через 24 часа (86 400 000 мс)
                setTimeout(async () => {
                    try {
                        const fetchedChannel = await guild.channels.fetch(ticketChannel.id).catch(() => null);
                        if (fetchedChannel) {
                            await fetchedChannel.delete('Авто-удаление тикета через 24 часа');
                            logger.info(`Тикет ${ticketChannel.id} автоматически удален по истечении 24 часов.`);
                        }
                    } catch (err) {
                        logger.error(`Ошибка при авто-удалении тикета:`, err);
                    }
                }, 86_400_000);

            } catch (error) {
                logger.error(`Ошибка при создании тикета:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    content: `❌ Произошла ошибка при создании обращения.`
                });
            }
        }

        // --- ВЗЯТЬ ОБРАЩЕНИЕ ---
        if (customId === 'ticket_claim') {
            const member = interaction.member;
            const hasAdminRole = member.roles.cache.has(ADMIN_ROLE_ID);
            const hasAdminPerms = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPerms) {
                return interaction.reply({
                    content: '❌ У вас нет прав для взятия тикетов!',
                    ephemeral: true
                });
            }

            // Находим упоминание создателя тикета из Embed
            const originalEmbed = interaction.message.embeds[0];
            const creatorField = originalEmbed?.fields?.find(f => f.name === 'Создал:');
            const creatorMention = creatorField ? creatorField.value : 'Пользователь';

            // Отключаем кнопку "Взять обращение"
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

            logger.info(`Тикет взят администратором`, { adminId: user.id, channelId: channel.id });
        }

        // --- ЗАКРЫТЬ ТИКЕТ ---
        if (customId === 'ticket_close') {
            await interaction.reply({ content: '🔐 Тикет будет удален через 5 секунд...' });

            logger.info(`Удаление тикета по кнопке`, { userId: user.id, channelId: channel.id });

            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    logger.error(`Ошибка при удалении канала тикета:`, error);
                }
            }, 5000);
        }
    }
};
