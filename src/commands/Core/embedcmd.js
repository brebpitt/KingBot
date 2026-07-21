import { SlashCommandBuilder, EmbedBuilder, ChannelType } = from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('эмбед')
        .setDescription('Отправить красивое эмбед-сообщение')
        .addStringOption(option =>
            option.setName('текст')
                .setDescription('Основной текст эмбеда')
                .setRequired(true)
                .setMaxLength(4000))
        .addStringOption(option =>
            option.setName('футер')
                .setDescription('Текст внизу эмбеда (необязательно)')
                .setRequired(false)
                .setMaxLength(2048))
        .addChannelOption(option =>
            option.setName('канал')
                .setDescription('Канал для отправки (необязательно)')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText)),

    async execute(interaction) {
        // Получаем опции
        const text = interaction.options.getString('текст');
        const footer = interaction.options.getString('футер');
        const channel = interaction.options.getChannel('канал') || interaction.channel;

        // Создаём эмбед
        const embed = new EmbedBuilder()
            .setDescription(text)
            .setColor(0x00AEFF) // Синий цвет
            .setTimestamp()
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL()
            });

        // Добавляем футер, если указан
        if (footer) {
            embed.setFooter({ text: footer });
        }

        try {
            // Отправляем эмбед в указанный канал
            await channel.send({ embeds: [embed] });
            
            // Подтверждаем выполнение (эпимерное сообщение)
            await interaction.reply({
                content: `✅ Эмбед отправлен в ${channel.toString()}`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Ошибка отправки эмбеда:', error);
            await interaction.reply({
                content: '❌ Не удалось отправить эмбед. Проверьте права бота.',
                ephemeral: true
            });
        }
    }
};
