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

const ADMIN_ROLE_ID = '1510803430166495295';
const HEX_REGEX = /^#?[0-9A-Fa-f]{6}$/;

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
                .setDescription('Цвет эмбеда в HEX (например: #FF6B00 или 3498db)')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('канал')
                .setDescription('Канал для отправки панели поддержки')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
         ),
    
    async execute(context, args) {
        // Проверяем: вызвано через Слэш (Interaction) или Префикс (Message)
        const isInteraction = context.isChatInputCommand?.() || context.isButton?.();

        // 1. Если кликнули по кнопке
        if (isInteraction && context.isButton()) {
            await this.handleButton(context);
            return;
        }

        let title, text, color, targetChannel;

        if (isInteraction) {
            // Данные из Слэш-команды
            const deferSuccess = await InteractionHelper.safeDefer(context, true);
            if (!deferSuccess) return;

            title = context.options.getString('заголовок');
            text = context.options.getString('текст');
            color = context.options.getString('цвет').trim();
            targetChannel = context.options.getChannel('канал');
        } else {
            // Данные из обычного сообщения (!поддержка Заголовок Текст #FF00FF #канал)
            const message = context;

            if (!args || args.length < 4) {
                return message.reply({
                    content: `❌ **Неверный формат команды!**\nИспользование: \`!поддержка [заголовок] [текст] [цвет HEX] [#канал]\``
                });
            }

            title = args[0];
            text = args[1];
            color = args[2].trim();
            
            // Находим канал по упоминанию или ID из 4 аргумента
            targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[3]);
            
            if (!targetChannel) {
                return message.reply({ content: '❌ Указанный канал не найден!' });
            }
        }

        // Подгоняем и валидируем HEX цвет
        if (!HEX_REGEX.test(color)) {
            const errorMsg = `❌ Некорректный HEX-формат цвета! Пример: \`#FF6B00\` или \`3498db\`.`;
            if (isInteraction) {
                await InteractionHelper.safeEditReply(context, { content: errorMsg });
            } else {
                await context.reply({ content: errorMsg });
            }
            return;
        }

        if (!color.startsWith('#')) color = `#${color}`;

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

            const successMsg = `✅ Панель поддержки успешно отправлена в ${targetChannel}!`;
            if (isInteraction) {
                await InteractionHelper.safeEditReply(context, { content: successMsg });
            } else {
                await context.reply({ content: successMsg });
            }

        } catch (error) {
            logger.error(`Ошибка при отправке панели поддержки:`, error);
            const failMsg = `❌ Не удалось отправить панель в канал.`;
            if (isInteraction) {
                await InteractionHelper.safeEditReply(context, { content: failMsg });
            } else {
                await context.reply({ content: failMsg });
            }
        }
    },

    // ===== ОБРАБОТКА КНОПОК =====
    async handleButton(interaction) {
        const { customId, guild, user, channel, member } = interaction;

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
                        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
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

            } catch (error) {
                logger.error(`Ошибка при создании тикета:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    content: `❌ Произошла ошибка при создании обращения.`
                });
            }
        }

        if (customId === 'ticket_claim') {
            const hasAdminRole = member?.roles?.cache?.has(ADMIN_ROLE_ID);
            const hasAdminPerms = member?.permissions?.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPerms) {
                return interaction.reply({
                    content: '❌ У вас нет прав для взятия тикетов!',
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
            await channel.send({ content: `${creatorMention}, тикет взял администратор ${user}!` });
        }

        if (customId === 'ticket_close') {
            await interaction.reply({ content: '🔐 Тикет будет удален через 5 секунд...' });

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
