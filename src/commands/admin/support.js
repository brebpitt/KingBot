import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits, 
    ChannelType,
    Message
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ADMIN_ROLE_ID = '1510803430166495295';
const TICKET_CATEGORY_ID = '1526713552407363604'; // Замените на ID категории для тикетов
const HEX_REGEX = /^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;
const MAX_TICKETS_PER_USER = 3;
const TICKET_DELETE_DELAY = 10000; // 10 секунд

export default {
    data: new SlashCommandBuilder()
        .setName('поддержка_панель')
        .setDescription('Отправить панель поддержки сервера KING MOBILE')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('заголовок')
                .setDescription('Заголовок обращения')
                .setRequired(true)
                .setMaxLength(256))
        .addStringOption(option => 
            option.setName('текст')
                .setDescription('Основной текст или инструкция')
                .setRequired(true)
                .setMaxLength(4000))
        .addStringOption(option => 
            option.setName('цвет')
                .setDescription('Цвет эмбеда в HEX (например: #FF6B00 или 3498db)')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('канал')
                .setDescription('Канал для отправки панели поддержки')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),
    
    async execute(context, args) {
        try {
            // Определяем тип контекста
            const isInteraction = context.isCommand?.() || context.isButton?.();
            const isMessage = context instanceof Message;

            // Если это кнопка
            if (isInteraction && context.isButton?.()) {
                await this.handleButton(context);
                return;
            }

            let title, text, color, targetChannel;

            // Обработка slash-команды
            if (isInteraction) {
                const deferSuccess = await InteractionHelper.safeDefer(context, true);
                if (!deferSuccess) return;

                title = context.options.getString('заголовок');
                text = context.options.getString('текст');
                color = context.options.getString('цвет').trim();
                targetChannel = context.options.getChannel('канал');

                // Проверка прав на отправку в канал
                const botMember = context.guild.members.cache.get(context.client.user.id);
                const channelPerms = targetChannel.permissionsFor(botMember);
                
                if (!channelPerms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                    await InteractionHelper.safeEditReply(context, {
                        content: '❌ У бота нет прав отправлять сообщения и эмбеды в указанный канал!'
                    });
                    return;
                }
            } 
            // Обработка префиксной команды
            else if (isMessage) {
                const message = context;
                
                // Парсим аргументы с поддержкой кавычек
                const argsStr = args.join(' ');
                const parsedArgs = argsStr.match(/"([^"]*)"|'([^']*)'|\S+/g)?.map(arg => 
                    arg.replace(/^["']|["']$/g, '')
                ) || [];

                if (parsedArgs.length < 4) {
                    return message.reply({
                        content: '❌ **Неверный формат команды!**\n' +
                                'Использование: `!поддержка "Заголовок" "Текст" #FF6B00 #канал`\n' +
                                'Пример: `!поддержка "Проблема с входом" "Опишите вашу проблему" #FF0000 #тикеты`'
                    });
                }

                title = parsedArgs[0];
                text = parsedArgs[1];
                color = parsedArgs[2].trim();
                
                // Поиск канала
                targetChannel = message.mentions.channels.first() || 
                               message.guild.channels.cache.get(parsedArgs[3]) ||
                               message.guild.channels.cache.find(ch => 
                                   ch.name === parsedArgs[3].replace('#', '') && 
                                   ch.type === ChannelType.GuildText
                               );

                if (!targetChannel) {
                    return message.reply({ 
                        content: '❌ Указанный канал не найден! Убедитесь, что вы правильно указали канал.' 
                    });
                }
            } else {
                return; // Неизвестный тип контекста
            }

            // Валидация цвета
            if (!HEX_REGEX.test(color)) {
                const errorMsg = '❌ Некорректный HEX-формат цвета!\n' +
                               'Примеры правильного формата: `#FF6B00`, `#f00`, `3498db`';
                
                if (isInteraction) {
                    await InteractionHelper.safeEditReply(context, { content: errorMsg });
                } else {
                    await context.reply({ content: errorMsg });
                }
                return;
            }

            // Нормализация цвета
            if (!color.startsWith('#')) color = `#${color}`;
            if (color.length === 4) {
                // Конвертируем 3-значный HEX в 6-значный
                color = `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
            }

            try {
                // Создаем эмбед
                const supportEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(text)
                    .setColor(color)
                    .setFooter({ 
                        text: 'Поддержка сервера KING MOBILE | Нажмите кнопку для создания обращения',
                        iconURL: context.guild?.iconURL() || null
                    })
                    .setTimestamp();

                // Создаем кнопку
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_create')
                        .setLabel('🗃️ Создать обращение')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📩')
                );

                // Отправляем панель
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

                // Логируем действие
                logger.info(`Панель поддержки отправлена в канал ${targetChannel.name} пользователем ${context.user?.tag || context.author?.tag}`);

            } catch (error) {
                logger.error(`Ошибка при отправке панели поддержки:`, error);
                const failMsg = `❌ Не удалось отправить панель в канал. Ошибка: ${error.message}`;
                
                if (isInteraction) {
                    await InteractionHelper.safeEditReply(context, { content: failMsg });
                } else {
                    await context.reply({ content: failMsg });
                }
            }
        } catch (error) {
            logger.error(`Критическая ошибка в execute:`, error);
            if (context.reply || context.editReply) {
                await context.reply?.({ 
                    content: '❌ Произошла критическая ошибка при выполнении команды.', 
                    ephemeral: true 
                });
            }
        }
    },

    // ===== ОБРАБОТКА КНОПОК =====
    async handleButton(interaction) {
        const { customId, guild, user, channel, member } = interaction;

        // Проверка, что бот имеет права
        const botMember = guild.members.cache.get(interaction.client.user.id);
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: '❌ У бота нет прав на создание каналов! Обратитесь к администратору.',
                ephemeral: true
            });
        }

        switch (customId) {
            case 'ticket_create':
                await this.handleTicketCreate(interaction);
                break;
            case 'ticket_claim':
                await this.handleTicketClaim(interaction);
                break;
            case 'ticket_close':
                await this.handleTicketClose(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Неизвестное действие.',
                    ephemeral: true
                });
        }
    },

    // ===== СОЗДАНИЕ ТИКЕТА =====
    async handleTicketCreate(interaction) {
        await InteractionHelper.safeDefer(interaction, true);

        try {
            const { guild, user, member } = interaction;

            // Проверка на количество открытых тикетов
            const userTickets = guild.channels.cache.filter(ch => 
                ch.name.startsWith(`ticket-${user.id}`) && 
                ch.type === ChannelType.GuildText &&
                ch.parentId === TICKET_CATEGORY_ID
            );

            if (userTickets.size >= MAX_TICKETS_PER_USER) {
                return InteractionHelper.safeEditReply(interaction, {
                    content: `❌ У вас уже открыто максимальное количество тикетов (${MAX_TICKETS_PER_USER}). Закройте старые тикеты.`
                });
            }

            // Проверка, не создан ли уже тикет
            const existingTicket = guild.channels.cache.find(ch => 
                ch.name === `ticket-${user.id}` && 
                ch.type === ChannelType.GuildText &&
                ch.parentId === TICKET_CATEGORY_ID
            );

            if (existingTicket) {
                return InteractionHelper.safeEditReply(interaction, {
                    content: `❌ У вас уже есть открытый тикет: ${existingTicket}`
                });
            }

            // Получаем категорию
            const category = guild.channels.cache.get(TICKET_CATEGORY_ID);
            if (!category || category.type !== ChannelType.GuildCategory) {
                logger.error(`Категория тикетов не найдена: ${TICKET_CATEGORY_ID}`);
                return InteractionHelper.safeEditReply(interaction, {
                    content: '❌ Ошибка конфигурации: категория тикетов не найдена. Обратитесь к администратору.'
                });
            }

            // Создаем канал тикета
            const ticketChannel = await guild.channels.create({
                name: `ticket-${user.id}`,
                type: ChannelType.GuildText,
                parent: TICKET_CATEGORY_ID,
                topic: `Тикет пользователя ${user.tag} (${user.id}) | Создан: ${new Date().toLocaleString()}`,
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
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AddReactions,
                            PermissionFlagsBits.UseExternalEmojis
                        ]
                    },
                    {
                        id: ADMIN_ROLE_ID,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AddReactions,
                            PermissionFlagsBits.UseExternalEmojis
                        ]
                    },
                    {
                        id: interaction.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks
                        ]
                    }
                ]
            });

            // Отправляем приветственное сообщение
            const ticketEmbed = new EmbedBuilder()
                .setTitle('🎫 Тикет создан!')
                .setColor('#2b2d31')
                .setDescription('Опишите вашу проблему подробно. Администрация ответит в ближайшее время.')
                .addFields(
                    { name: '👤 Создал:', value: `${user} (${user.tag})`, inline: true },
                    { name: '🕐 Дата открытия:', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '📋 Статус:', value: '🟢 Ожидает ответа', inline: true }
                )
                .setFooter({ 
                    text: 'Поддержка сервера KING MOBILE',
                    iconURL: interaction.guild.iconURL() || null
                })
                .setTimestamp();

            const ticketRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_claim')
                    .setLabel('👤 Взять обращение')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('🔐 Закрыть тикет')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒'),
                new ButtonBuilder()
                    .setCustomId('ticket_transcript')
                    .setLabel('📄 Транскрипт')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📋')
                    .setDisabled(true) // Будет активировано при закрытии
            );

            await ticketChannel.send({
                content: `👋 Приветствуем, ${user}!`,
                embeds: [ticketEmbed],
                components: [ticketRow]
            });

            // Пингуем админов
            const adminRole = guild.roles.cache.get(ADMIN_ROLE_ID);
            if (adminRole) {
                await ticketChannel.send({
                    content: `${adminRole} Новый тикет требует внимания!`
                });
            }

            // Логируем создание тикета
            logger.info(`Тикет создан пользователем ${user.tag} (${user.id}) в канале ${ticketChannel.name}`);

            await InteractionHelper.safeEditReply(interaction, {
                content: `✅ Ваш тикет создан: ${ticketChannel}`
            });

        } catch (error) {
            logger.error(`Ошибка при создании тикета:`, error);
            await InteractionHelper.safeEditReply(interaction, {
                content: `❌ Произошла ошибка при создании обращения. Ошибка: ${error.message}`
            });
        }
    },

    // ===== ВЗЯТИЕ ТИКЕТА =====
    async handleTicketClaim(interaction) {
        const { member, channel, user } = interaction;

        // Проверка прав
        const hasAdminRole = member?.roles?.cache?.has(ADMIN_ROLE_ID);
        const hasAdminPerms = member?.permissions?.has(PermissionFlagsBits.Administrator);

        if (!hasAdminRole && !hasAdminPerms) {
            return interaction.reply({
                content: '❌ У вас нет прав для взятия тикетов!',
                ephemeral: true
            });
        }

        // Проверяем, не взят ли уже тикет
        const embed = interaction.message.embeds[0];
        const statusField = embed?.fields?.find(f => f.name === '📋 Статус:');
        if (statusField?.value.includes('Взято')) {
            return interaction.reply({
                content: '❌ Этот тикет уже взят другим администратором!',
                ephemeral: true
            });
        }

        try {
            // Обновляем эмбед
            const updatedEmbed = EmbedBuilder.from(embed)
                .spliceFields(
                    embed.fields.findIndex(f => f.name === '📋 Статус:'), 
                    1,
                    { name: '📋 Статус:', value: `🟡 Взято администратором ${user}`, inline: true }
                )
                .addFields(
                    { name: '👤 Взял:', value: `${user}`, inline: true },
                    { name: '🕐 Время взятия:', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                );

            // Обновляем кнопки
            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_claim')
                    .setLabel('👤 Взято')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('🔐 Закрыть тикет')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒'),
                new ButtonBuilder()
                    .setCustomId('ticket_transcript')
                    .setLabel('📄 Транскрипт')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📋')
            );

            await interaction.update({ 
                embeds: [updatedEmbed], 
                components: [updatedRow] 
            });

            // Уведомление в канале
            const creatorField = embed?.fields?.find(f => f.name === '👤 Создал:');
            const creatorId = creatorField?.value?.match(/\d+/)?.[0];
            const creator = creatorId ? await interaction.guild.members.fetch(creatorId).catch(() => null) : null;

            await channel.send({
                content: creator ? 
                    `${creator}, ваш тикет взял администратор ${user}! Ожидайте ответа.` :
                    `${user} взял тикет!`
            });

            logger.info(`Тикет ${channel.name} взят администратором ${user.tag} (${user.id})`);

        } catch (error) {
            logger.error(`Ошибка при взятии тикета:`, error);
            await interaction.reply({
                content: `❌ Ошибка при взятии тикета: ${error.message}`,
                ephemeral: true
            });
        }
    },

    // ===== ЗАКРЫТИЕ ТИКЕТА =====
    async handleTicketClose(interaction) {
        const { member, channel, user } = interaction;

        // Проверка прав
        const hasAdminRole = member?.roles?.cache?.has(ADMIN_ROLE_ID);
        const hasAdminPerms = member?.permissions?.has(PermissionFlagsBits.Administrator);
        const isOwner = channel.name === `ticket-${user.id}`;

        if (!hasAdminRole && !hasAdminPerms && !isOwner) {
            return interaction.reply({
                content: '❌ У вас нет прав для закрытия этого тикета!',
                ephemeral: true
            });
        }

        // Создаем транскрипт перед закрытием
        try {
            const messages = await channel.messages.fetch({ limit: 100 });
            const transcript = messages
                .reverse()
                .map(msg => `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content}`)
                .join('\n');

            // Сохраняем транскрипт в лог
            logger.info(`Транскрипт тикета ${channel.name}:\n${transcript}`);

            // Можно отправить транскрипт в лог-канал
            const logChannel = interaction.guild.channels.cache.find(ch => ch.name === 'ticket-logs');
            if (logChannel) {
                const transcriptEmbed = new EmbedBuilder()
                    .setTitle(`📄 Транскрипт тикета ${channel.name}`)
                    .setColor('#2b2d31')
                    .addFields(
                        { name: 'Закрыт:', value: `${user}`, inline: true },
                        { name: 'Всего сообщений:', value: `${messages.size}`, inline: true },
                        { name: 'Дата закрытия:', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await logChannel.send({
                    embeds: [transcriptEmbed],
                    files: [{
                        attachment: Buffer.from(transcript, 'utf-8'),
                        name: `transcript-${channel.name}-${Date.now()}.txt`
                    }]
                });
            }

        } catch (error) {
            logger.error(`Ошибка при создании транскрипта:`, error);
        }

        // Уведомление о закрытии
        await interaction.reply({
            content: `🔐 Тикет будет удален через ${TICKET_DELETE_DELAY/1000} секунд...`
        });

        // Обновляем название канала
        try {
            await channel.setName(`closed-${channel.name}`);
        } catch (error) {
            logger.error(`Ошибка при переименовании канала:`, error);
        }

        // Удаляем канал через заданное время
        setTimeout(async () => {
            try {
                logger.info(`Удаление тикета ${channel.name} пользователем ${user.tag} (${user.id})`);
                await channel.delete();
            } catch (error) {
                logger.error(`Ошибка при удалении канала тикета:`, error);
            }
        }, TICKET_DELETE_DELAY);
    }
};
