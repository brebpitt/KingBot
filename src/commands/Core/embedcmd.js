import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';

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

        // ===== ОСНОВНОЙ ЭМБЕД =====
        const embed = new EmbedBuilder()
            .setColor('#ffb5b5')
            .setDescription(text)
            .setTimestamp()      
            .setAuthor()
            });

        // Добавляем футер, если указан
        if (footer) {
            embed.setFooter({ text: footer });
        }

        try {
            // Отправляем эмбед в указанный канал
            await channel.send({ embeds: [embed] });
            
            // Подтверждение (эпимерное)
            await interaction.reply({
                content: `✅ Эмбед успешно отправлен в ${channel.toString()}`,
                ephemeral: true
            });
        } catch (error) {
            console.error('❌ Ошибка отправки эмбеда:', error);
            await interaction.reply({
                content: '❌ Не удалось отправить эмбед. Проверьте права бота в канале.',
                ephemeral: true
            });
        }
    }
};
