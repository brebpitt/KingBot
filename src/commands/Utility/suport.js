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
// ID роли администрации, которая будет видеть созданные тикеты
const ADMIN_ROLE_ID = '1510803430166495295'; 

export default {
    data: new SlashCommandBuilder()
        .setName('поддержка')
        .setDescription('Отправить панель системы поддержки KING MOBILE в канал')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('заголовок')
                .setDescription('Заголовок обращения/панели')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('текст')
                .setDescription('Описание или инструкция')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('цвет')
                .setDescription('Цвет эмбеда (например: #3498db, #ff0000 или Red, Blue)')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('канал')
                .setDescription('Канал, куда вы отправить панель')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    async execute(interaction) {
        // Если взаимодействие вызвано нажатием на одну из кнопок
        if (interaction.isButton()) {
            await this.handleButton(interaction);
            return;
        }

        // Обработка выполнения слэш-команды /поддержка
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
        const color = interaction.options.getString('цвет');
        const targetChannel = interaction.options.getChannel('канал');

        try {
            // Эмбед вызова панели
            const mainEmbed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(text)
                .setColor(color)
                .setFooter({ text: 'Поддержка сервера KING MOBILE' });

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

            logger.info(`Панель поддержки отправлена`, {
                adminId: interaction.user.id,
                targetChannelId: targetChannel.id,
                guildId: interaction.guildId
            });

        } catch (error) {
            logger.error(`Ошибка при отправке панели поддержки:`, error);
            await InteractionHelper.safeEditReply(interaction, {
                content: `❌ Не удалось отправить панель в канал.`
            });
        }
    },

    // ===== ОБРАБОТЧИК КНОПОК =====
    async handleButton(interaction) {
        const { customId, guild, user, channel } = interaction;

        // 1. НАЖАТИЕ: "🗃️ Создать обращение"
        if (customId === 'ticket_create') {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, true);
            if (!deferSuccess) return;

            try {
                // Имя текстового канала
                const channelName = `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');

                // Создаем приватный канал
                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.id, // Скрываем от всех
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: user.id, // Открываем автору
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        },
                        {
                            id: ADMIN_ROLE_ID, // Открываем админам
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles
                            ]
                        }
                    ]
                });

                // Эмбед внутри тикета
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
                    content: `Приветствуем ${user}! Опишите вашу проблему, администрация скоро ответит.`, 
                    embeds: [ticketEmbed], 
                    components: [ticketRow] 
                });

                await InteractionHelper.safeEditReply(interaction, {
                    content: `✅ Ваш тикет создан: ${ticketChannel}`
                });

                logger.info(`Тикет создан`, { userId: user.id, channelId: ticketChannel.id });

                // Автоматическое удаление тикета через 24 часа (86 400 000 миллисекунд)
                setTimeout(async () => {
                    try {
                        const existingChannel = await guild.channels.fetch(ticketChannel.id).catch(() => null);
                        if (existingChannel) {
                            await existingChannel.delete('Автоматическое удаление тикета по истечении 24 часов');
                            logger.info(`Тикет ${ticketChannel.id} автоматически удален спустя 24ч.`);
                        }
                    } catch (err) {
                        logger.error(`Ошибка авто-удаления тикета:`, err);
                    }
                }, 86_400_000);

            } catch (error) {
                logger.error(`Ошибка при создании тикета:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    content: `❌ Произошла ошибка при создании тикета.`
                });
            }
        }

        // 2. НАЖАТИЕ: "👤 Взять обращение"
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

            // Находим автора из первого поля эмбеда
            const originalEmbed = interaction.message.embeds[0];
            const creatorField = originalEmbed?.fields.find(f => f.name === 'Создал:');
            const creatorMention = creatorField ? creatorField.value : 'Пользователь';

            // Обновляем кнопки (делаем "Взять" неактивной)
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

            logger.info(`Тикет взят в работу`, { adminId: user.id, channelId: channel.id });
        }

        // 3. НАЖАТИЕ: "🔐 Закрыть тикет"
        if (customId === 'ticket_close') {
            await interaction.reply({ content: '🔐 Тикет будет удален через 5 секунд...' });

            logger.info(`Тикет закрывается пользователем ${user.tag}`, { channelId: channel.id });

            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    logger.error(`Ошибка при удалении тикета:`, error);
                }
            }, 5000);
        }
    }
};
                        
