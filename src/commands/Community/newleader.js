import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from `discord.js`;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('назначить_лидера')
        .setDescription('Назначить нового лидера фракции')
        .addStringOption(option =>
            option.setName('фракция')
                .setDescription('Выберите фракцию')
                .setRequired(true)
                .addChoices(
                    { name: 'Правительство', value: 'Правительство' },
                    { name: 'ФСБ', value: 'ФСБ' },
                    { name: 'МВД', value: 'МВД' },
                    { name: 'ГИБДД', value: 'ГИБДД' },
                    { name: 'ВЧ', value: 'ВЧ' },
                    { name: 'ГБ', value: 'ГБ' },
                    { name: 'СМИ', value: 'СМИ' },
                    { name: 'Батыревское ОПГ', value: 'Батыревское ОПГ' },
                    { name: 'Арзамасская ОПГ', value: 'Арзамасская ОПГ' },
                    { name: 'Лыткаринская ОПГ', value: 'Лыткаринская ОПГ' }
                ))
        .addUserOption(option =>
            option.setName('игрок')
                .setDescription('Игрок, которого назначают лидером')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('мороз')
                .setDescription('Время в часах (от 24 до 62)')
                .setRequired(true)
                .addChoices(
                    { name: '24 часа', value: '24' },
                    { name: '30 часов', value: '30' },
                    { name: '36 часов', value: '36' },
                    { name: '42 часа', value: '42' },
                    { name: '48 часов', value: '48' },
                    { name: '54 часа', value: '54' },
                    { name: '60 часов', value: '60' },
                    { name: '62 часа', value: '62' }
                ))
        .addStringOption(option =>
            option.setName('подтверждение_гс')
                .setDescription('Подтверждение от ГС (необязательно)')
                .setRequired(false)
                .addChoices(
                    { name: '✅ Подтверждено', value: '✅ Подтверждено ГС' },
                    { name: '❌ Не подтверждено', value: '❌ Не подтверждено ГС' }
                )),

    async execute(interaction) {
        // Проверка прав (только для администраторов)
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '❌ У вас недостаточно прав для использования этой команды!',
                ephemeral: true
            });
        }

        const faction = interaction.options.getString('фракция');
        const player = interaction.options.getUser('игрок');
        const freezeTime = interaction.options.getString('мороз');
        const gsConfirm = interaction.options.getString('подтверждение_гс') || '';

        // Рассчет времени окончания
        const now = new Date();
        const endTime = new Date(now.getTime() + parseInt(freezeTime) * 60 * 60 * 1000);
        
        const formatDate = (date) => {
            return date.toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/Moscow'
            });
        };

        // Создание эмбеда
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🌟 НАЗНАЧЕНИЕ ЛИДЕРА')
            .setDescription(`
🌟 Доброго времени суток, уважаемый <@&1510804231278301336>

🏆 Новым лидером организации **${faction}** Нижегородской области назначен <@${player.id}>! Он официально вступил в должность и приступил к исполнению обязанностей.

> 🎉 Поздравляем его с назначением на высокий пост! Уверены, что он достигнет всех поставленных целей.

> На основании решения Лидера **${faction}** деятельность фракции временно приостанавливается.
> На **${freezeTime} часов**, окончание **${formatDate(endTime)}**.
            `)
            .addFields(
                { name: '👤 Назначен', value: `<@${player.id}>`, inline: true },
                { name: '🏛️ Фракция', value: faction, inline: true },
                { name: '⏰ Мороз', value: `${freezeTime} часов`, inline: true },
                { name: '📋 Подтверждение ГС', value: gsConfirm || 'Не указано', inline: false }
            )
            .setFooter({ 
                text: `Назначил: ${interaction.user.tag} | ${new Date().toLocaleString('ru-RU')}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
