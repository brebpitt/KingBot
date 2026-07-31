const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Укажите ID роли администрации, которая должна иметь доступ к тикетам
const ADMIN_ROLE_ID = 'ID_ВАШЕЙ_РОЛИ_АДМИНИСТРАЦИИ'; 

// Регистрация слэш-команды
client.on('ready', async () => {
    console.log(`Бот ${client.user.tag} успешно запущен!`);

    const supportCommand = new SlashCommandBuilder()
        .setName('поддержка')
        .setDescription('Отправить эмбед поддержки в указанный канал')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('заголовок')
                .setDescription('Заголовок эмбеда')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('текст')
                .setDescription('Текст сообщения')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('цвет')
                .setDescription('Цвет в HEX форматах (например: #3498db или GREEN, RED)')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('канал')
                .setDescription('Канал для отправки')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true));

    await client.application.commands.set([supportCommand]);
    console.log('Слэш-команда /поддержка зарегистрирована.');
});

// Обработка взаимодействия (команды и кнопки)
client.on('interactionCreate', async interaction => {
    
    // 1. Команда /поддержка
    if (interaction.isChatInputCommand() && interaction.commandName === 'поддержка') {
        const title = interaction.options.getString('заголовок');
        const text = interaction.options.getString('текст');
        const color = interaction.options.getString('цвет');
        const targetChannel = interaction.options.getChannel('канал');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(text)
            .setColor(color)
            .setFooter({ text: 'Поддержка сервера KING MOBILE' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('🗃️ Создать обращение')
                .setStyle(ButtonStyle.Primary)
        );

        await targetChannel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: `Панель поддержки успешно отправлена в канал ${targetChannel}`, ephemeral: true });
    }

    // 2. Обработка нажатий на кнопки
    if (interaction.isButton()) {
        const { customId, guild, user, channel } = interaction;

        // Создание тикета
        if (customId === 'create_ticket') {
            await interaction.deferReply({ ephemeral: true });

            // Формируем имя канала (например: ticket-username)
            const channelName = `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');

            // Создаем канал тикета
            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.id, // Скрываем от всех
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: user.id, // Разрешаем автору тикета
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                    },
                    {
                        id: ADMIN_ROLE_ID, // Разрешаем администрации
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                    }
                ],
            });

            // Эмбед в созданном тикете
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
                    .setCustomId('claim_ticket')
                    .setLabel('👤 Взять обращение')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('🔐 Закрыть тикет')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ content: `${user}, Ваше обращение создано!`, embeds: [ticketEmbed], components: [ticketRow] });
            
            await interaction.editReply({ content: `Ваш тикет создан: ${ticketChannel}` });

            // Автоматическое удаление через 24 часа (86400000 мс)
            setTimeout(async () => {
                const fetchedChannel = await guild.channels.fetch(ticketChannel.id).catch(() => null);
                if (fetchedChannel) {
                    await fetchedChannel.delete('Автоматическое удаление тикета через 24 часа').catch(() => null);
                }
            }, 86_400_000);
        }

        // Взять обращение
        if (customId === 'claim_ticket') {
            // Ищем поле "Создал" из эмбеда сообщения
            const originalEmbed = interaction.message.embeds[0];
            const creatorField = originalEmbed.fields.find(f => f.name === 'Создал:');
            const creatorMention = creatorField ? creatorField.value : 'Пользователь';

            // Деактивируем кнопку "Взять обращение"
            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('claim_ticket')
                    .setLabel('👤 Взято')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('🔐 Закрыть тикет')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.update({ components: [updatedRow] });
            await channel.send({ content: `${creatorMention} тикет взят ${user}` });
        }

        // Закрыть тикет
        if (customId === 'close_ticket') {
            await interaction.reply({ content: 'Тикет будет удален через 5 секунд...' });
            setTimeout(() => {
                channel.delete().catch(() => null);
            }, 5000);
        }
    }
});
