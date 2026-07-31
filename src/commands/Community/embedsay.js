import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('эмбед')
        .setDescription('📨 Создать и отправить эмбед в указанный канал')
        .addStringOption(option =>
            option.setName('заголовок')
                .setDescription('Заголовок эмбеда')
                .setRequired(true)
                .setMaxLength(256))
        .addStringOption(option =>
            option.setName('текст')
                .setDescription('Основной текст эмбеда')
                .setRequired(true)
                .setMaxLength(4000))
        .addStringOption(option =>
            option.setName('футер')
                .setDescription('Текст в футере эмбеда')
                .setRequired(false)
                .setMaxLength(2048))
        .addStringOption(option =>
            option.setName('цвет')
                .setDescription('Цвет эмбеда (HEX или название)')
                .setRequired(false)
                .addChoices(
                    { name: '🔴 Красный', value: '#FF0000' },
                    { name: '🟢 Зеленый', value: '#00FF00' },
                    { name: '🔵 Синий', value: '#0099FF' },
                    { name: '🟡 Желтый', value: '#FFD700' },
                    { name: '🟣 Фиолетовый', value: '#9B59B6' },
                    { name: '🟠 Оранжевый', value: '#FF6B00' },
                    { name: '⚪ Белый', value: '#FFFFFF' },
                    { name: '⚫ Черный', value: '#000000' },
                    { name: '🌈 Случайный', value: 'random' }
                ))
        .addChannelOption(option =>
            option.setName('канал')
                .setDescription('Канал для отправки эмбеда (по умолчанию текущий)')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        try {
            // Проверка прав
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: '❌ У вас нет прав для использования этой команды! Требуется права **Администратора**.',
                    ephemeral: true
                });
            }

            // Получение опций
            const title = interaction.options.getString('заголовок');
            const description = interaction.options.getString('текст');
            const footer = interaction.options.getString('футер');
            const colorInput = interaction.options.getString('цвет') || '#0099FF';
            const targetChannel = interaction.options.getChannel('канал') || interaction.channel;

            // Проверка прав на отправку в канал
            if (targetChannel) {
                const botPermissions = targetChannel.permissionsFor(interaction.guild.members.me);
                if (!botPermissions.has(['SendMessages', 'EmbedLinks'])) {
                    return interaction.reply({
                        content: `❌ У бота нет прав отправлять сообщения или встраивать ссылки в канале ${targetChannel}!`,
                        ephemeral: true
                    });
                }
            }

            // Определение цвета
            let color = colorInput;
            if (colorInput === 'random') {
                color = Math.floor(Math.random() * 16777215);
            } else if (colorInput.startsWith('#')) {
                color = colorInput;
            } else {
                const colorMap = {
                    'красный': '#FF0000',
                    'зеленый': '#00FF00',
                    'синий': '#0099FF',
                    'желтый': '#FFD700',
                    'фиолетовый': '#9B59B6',
                    'оранжевый': '#FF6B00',
                    'белый': '#FFFFFF',
                    'черный': '#000000'
                };
                color = colorMap[colorInput.toLowerCase()] || '#0099FF';
            }

            // Создание эмбеда
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(description)
                .setTimestamp();

            // Добавляем футер если есть
            if (footer) {
                embed.setFooter({ text: footer });
            } else {
                embed.setFooter({ 
                    text: `Отправлено: ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                });
            }

            // Отправка эмбеда
            await targetChannel.send({ embeds: [embed] });

            // Подтверждение пользователю
            const logEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Эмбед успешно отправлен!')
                .addFields(
                    { name: '📌 Канал', value: targetChannel.toString(), inline: true },
                    { name: '📝 Заголовок', value: title || 'Без заголовка', inline: true },
                    { name: '🎨 Цвет', value: typeof color === 'string' ? color : `#${color.toString(16).padStart(6, '0')}`, inline: true }
                )
                .setTimestamp();

            if (footer) {
                logEmbed.addFields({ name: '📎 Футер', value: footer, inline: true });
            }

            return interaction.reply({
                embeds: [logEmbed],
                ephemeral: true
            });

        } catch (error) {
            console.error('Ошибка в команде эмбед:', error);
            
            // Пытаемся ответить с ошибкой
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: `❌ Произошла ошибка: ${error.message}`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: `❌ Произошла ошибка: ${error.message}`,
                        ephemeral: true
                    });
                }
            } catch (e) {
                console.error('Не удалось отправить сообщение об ошибке:', e);
            }
        }
    }
};
