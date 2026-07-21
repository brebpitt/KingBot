import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

// ===== ФРАКЦИИ =====
const FACTIONS = [
    { label: '🏛️ Правительство', value: 'government' },
    { label: '🔐 ФСБ', value: 'fsb' },
    { label: '🚔 МВД', value: 'mvd' },
    { label: '🚦 ГИБДД', value: 'gibdd' },
    { label: '⚔️ ВЧ', value: 'vch' },
    { label: '🏥 Городская Больница', value: 'gb' },
    { label: '📺 СМИ', value: 'media' },
    { label: '🔫 Арзамасская ОПГ', value: 'arzamas' },
    { label: '🔪 Батыревское ОПГ', value: 'batyrevo' },
    { label: '💀 Лыткаринская ОПГ', value: 'lytkarino' }
];

export default {
    data: new SlashCommandBuilder()
        .setName('назначить_лидера')
        .setDescription('Назначить нового лидера фракции')
        .addStringOption(option =>
            option.setName('фракция')
                .setDescription('Выберите фракцию')
                .setRequired(true)
                .addChoices(
                    ...FACTIONS.map(f => ({ name: f.label, value: f.value }))
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
        const factionValue = interaction.options.getString('фракция');
        const player = interaction.options.getUser('игрок');
        const freezeTime = interaction.options.getString('мороз');
        const gsConfirm = interaction.options.getString('подтверждение_гс') || 'Не указано';

        const selectedFaction = FACTIONS.find(f => f.value === factionValue);
        if (!selectedFaction) {
            return interaction.reply({
                content: '❌ Выбрана несуществующая фракция!',
                ephemeral: true
            });
        }

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

        // ===== ОСНОВНОЙ ЭМБЕД =====
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🌟 НАЗНАЧЕНИЕ ЛИДЕРА')
            .setThumbnail(player.displayAvatarURL({ dynamic: true, size: 256 }))
            .setDescription(`
🌟 Доброго времени суток, уважаемые сотрудники!

🏆 Новым лидером организации **${selectedFaction.label}** Нижегородской области назначен <@${player.id}>! Он официально вступил в должность и приступил к исполнению обязанностей.

> 🎉 Поздравляем его с назначением на высокий пост! Уверены, что он достигнет всех поставленных целей.

> На основании решения Лидера **${selectedFaction.label}** деятельность фракции временно приостанавливается.
> На **${freezeTime} часов**, окончание **${formatDate(endTime)}**.
            `)
            .addFields(
                { name: '👤 Назначен', value: `<@${player.id}>`, inline: true },
                { name: '🏛️ Фракция', value: selectedFaction.label, inline: true },
                { name: '⏰ Мороз', value: `${freezeTime} часов\nдо ${formatDate(endTime)}`, inline: true },
                { name: '📋 Подтверждение ГС', value: gsConfirm, inline: true }
            )
            .setFooter({ 
                text: `Назначил: ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        // ===== ОТПРАВКА В КАНАЛ =====
        await interaction.reply({
            embeds: [embed]
        });
    }
};
