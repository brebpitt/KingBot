import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { 
    approveButtonHandler,
    rejectButtonHandler,
    infoButtonHandler,
    dmButtonHandler
} from './handlers/zaprosButtons.js';

// ===== НАСТРОЙКИ (ЗАМЕНИТЕ НА СВОИ) =====
const ADMIN_CHANNEL_ID = '1528732465747857438';
const ADMIN_ROLE_ID = '1510803430166495295';
const LOG_CHANNEL_ID = '1523639667952582666';

// ===== ФРАКЦИИ ИЗ БЛЭК РАШ =====
const FACTIONS = [
    { label: '🏛️ Правительство', value: 'government', emoji: '🏛️' },
    { label: '🔐 ФСБ', value: 'fsb', emoji: '🔐' },
    { label: '🚔 МВД', value: 'mvd', emoji: '🚔' },
    { label: '🚦 ГИБДД', value: 'gibdd', emoji: '🚦' },
    { label: '⚔️ ВЧ', value: 'vch', emoji: '⚔️' },
    { label: '🏥 Центральная Больница', value: 'hospital', emoji: '🏥' },
    { label: '📺 СМИ', value: 'media', emoji: '📺' },
    { label: '🔫 Арзамасская ОПГ', value: 'arzamas', emoji: '🔫' },
    { label: '🔪 Батыревское ОПГ', value: 'batyrevo', emoji: '🔪' },
    { label: '💀 Лыткаринское ОПГ', value: 'lytkarino', emoji: '💀' }
];

// ===== ID РОЛЕЙ ДЛЯ АВТОВЫДАЧИ (ЗАМЕНИТЕ НА РЕАЛЬНЫЕ ID) =====
const ROLE_IDS = {
    'government': '1510804026206453790',
    'fsb': '1510804034552987748',
    'mvd': '1510804042924691607',
    'gibdd': '1510804051334402200',
    'vch': '1510804060087910521',
    'hospital': '1510804068145037412',
    'media': '1510804088596725920',
    'arzamas': '1510804096737607962',
    'batyrevo': '1510804105516417085',
    'lytkarino': '1510804113775001900'
};

export default {
    data: new SlashCommandBuilder()
        .setName('запрос_роли')
        .setDescription('Отправить заявку на получение роли фракции')
        .addStringOption(option =>
            option.setName('фракция')
                .setDescription('Выберите фракцию')
                .setRequired(true)
                .addChoices(
                    ...FACTIONS.map(f => ({ name: f.label, value: f.value }))
                ))
        .addStringOption(option =>
            option.setName('причина')
                .setDescription('Почему вы хотите вступить во фракцию?')
                .setRequired(true)
                .setMaxLength(500))
        .addStringOption(option =>
            option.setName('опыт')
                .setDescription('Ваш опыт в этой сфере')
                .setRequired(false)
                .setMaxLength(300)),

    async execute(interaction) {
        // Если это кнопка - обрабатываем как заявку
        if (interaction.isButton()) {
            await this.handleButton(interaction);
            return;
        }

        // Если это команда - обрабатываем как создание заявки
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ошибка отложенного ответа для команды запроса роли`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'запрос_роли'
            });
            return;
        }

        const factionValue = interaction.options.getString('фракция');
        const reason = interaction.options.getString('причина');
        const experience = interaction.options.getString('опыт') || 'Не указан';
        const user = interaction.user;

        const selectedFaction = FACTIONS.find(f => f.value === factionValue);
        if (!selectedFaction) {
            return InteractionHelper.safeEditReply(interaction, {
                content: '❌ Выбрана несуществующая фракция!'
            });
        }

        // ===== EMBED ДЛЯ АДМИНОВ =====
        const adminEmbed = new EmbedBuilder()
            .setColor('#FF6B00')
            .setTitle('📩 НОВАЯ ЗАЯВКА НА РОЛЬ')
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setDescription(`**${user.tag}** хочет вступить во фракцию`)
            .addFields(
                { name: '👤 Игрок', value: `${user}`, inline: true },
                { name: '🏷️ Тег', value: `\`${user.tag}\``, inline: true },
                { name: '📋 Фракция', value: `${selectedFaction.emoji} **${selectedFaction.label}**`, inline: true },
                { name: '📝 Причина', value: reason || 'Не указана' },
                { name: '💼 Опыт', value: experience || 'Не указан' },
                { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
                { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: `Система заявок Блэк Раш | Заявка #${Date.now().toString().slice(-6)}` })
            .setTimestamp();

        // ===== КНОПКИ ДЛЯ АДМИНОВ =====
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${user.id}_${factionValue}`)
                    .setLabel('✅ Принять')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`reject_${user.id}_${factionValue}`)
                    .setLabel('❌ Отклонить')
                    .setStyle(ButtonStyle.Danger)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`info_${user.id}_${factionValue}`)
                    .setLabel('ℹ️ Информация')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`dm_${user.id}_${factionValue}`)
                    .setLabel('✉️ Написать в ЛС')
                    .setStyle(ButtonStyle.Primary)
            );

        // ===== ОТПРАВКА АДМИНАМ =====
        try {
            const adminChannel = await interaction.guild.channels.fetch(ADMIN_CHANNEL_ID);
            if (adminChannel) {
                await adminChannel.send({
                    content: `🔔 <@&${ADMIN_ROLE_ID}> Поступила новая заявка!`,
                    embeds: [adminEmbed],
                    components: [row1, row2]
                });
                logger.info(`Заявка отправлена в админ-канал`, {
                    userId: user.id,
                    faction: factionValue,
                    guildId: interaction.guildId
                });
            }
        } catch (error) {
            logger.error(`Ошибка отправки в админ-канал:`, error);
        }

        // ===== ПОДТВЕРЖДЕНИЕ ПОЛЬЗОВАТЕЛЮ (ТОЛЬКО ЕМУ ВИДНО) =====
        const userEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Заявка отправлена!')
            .setDescription(`Ваша заявка на вступление во фракцию **${selectedFaction.label}** успешно отправлена.`)
            .addFields(
                { name: '📋 Фракция', value: `${selectedFaction.emoji} ${selectedFaction.label}`, inline: true },
                { name: '📝 Причина', value: reason || 'Не указана', inline: true },
                { name: '💼 Опыт', value: experience || 'Не указан', inline: true },
                { name: '⏳ Статус', value: '🟡 Ожидает рассмотрения...' },
                { name: '📌 Номер заявки', value: `\`#${Date.now().toString().slice(-6)}\``, inline: true }
            )
            .setFooter({ text: 'Администрация рассмотрит вашу заявку в ближайшее время' })
            .setTimestamp();

        // Отправляем ответ ТОЛЬКО пользователю, вызвавшему команду
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [userEmbed],
            ephemeral: false
        });

        logger.info(`Заявка на роль создана`, {
            userId: user.id,
            faction: factionValue,
            guildId: interaction.guildId
        });
    },

    // ===== ОБРАБОТКА КНОПОК (внутренний метод) =====
    async handleButton(interaction) {
        const customId = interaction.customId;
        const [action, userId, factionValue] = customId.split('_');
        
        if (!['approve', 'reject', 'info', 'dm'].includes(action)) return;

        const member = interaction.member;
        const hasAdminRole = member.roles.cache.has(ADMIN_ROLE_ID);
        const hasAdminPerms = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasAdminRole && !hasAdminPerms) {
            return interaction.reply({
                content: '❌ У вас нет прав для обработки заявок!',
                ephemeral: true
            });
        }

        const faction = FACTIONS.find(f => f.value === factionValue);
        if (!faction) {
            return interaction.reply({
                content: '❌ Фракция не найдена!',
                ephemeral: true
            });
        }

        let targetUser;
        try {
            targetUser = await interaction.guild.members.fetch(userId);
        } catch (error) {
            return interaction.reply({
                content: '❌ Пользователь не найден на сервере!',
                ephemeral: true
            });
        }

        if (action === 'info') {
            const infoEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`ℹ️ Информация о фракции: ${faction.label}`)
                .addFields(
                    { name: '📋 Название', value: faction.label },
                    { name: '🆔 ID', value: `\`${factionValue}\`` },
                    { name: '👤 Заявитель', value: `${targetUser.user.tag} (${targetUser.id})` }
                )
                .setTimestamp();
            
            return interaction.reply({
                embeds: [infoEmbed],
                ephemeral: true
            });
        }

        if (action === 'dm') {
            try {
                await targetUser.send({
                    content: `📩 Вам написал администратор **${interaction.user.tag}** по поводу вашей заявки во фракцию **${faction.label}**.\nОжидайте ответа в этом чате.`
                });
            } catch (error) {
                logger.warn(`Не удалось отправить ЛС пользователю ${targetUser.user.tag}`, error);
            }
            
            return interaction.reply({
                content: `✅ Сообщение отправлено пользователю ${targetUser.user.tag}!`,
                ephemeral: true
            });
        }

        const isApproved = action === 'approve';
        
        if (isApproved && ROLE_IDS[factionValue] && ROLE_IDS[factionValue] !== 'ID_РОЛИ_*') {
            try {
                await targetUser.roles.add(ROLE_IDS[factionValue]);
                logger.info(`Роль выдана пользователю ${targetUser.user.tag}`, {
                    userId: targetUser.user.id,
                    faction: factionValue,
                    adminId: interaction.user.id
                });
            } catch (error) {
                logger.error(`Ошибка выдачи роли:`, error);
            }
        }

        const resultEmbed = new EmbedBuilder()
            .setColor(isApproved ? '#00FF00' : '#FF0000')
            .setTitle(isApproved ? '✅ Заявка одобрена!' : '❌ Заявка отклонена')
            .setDescription(
                isApproved 
                    ? `Поздравляем! Ваша заявка на вступление во фракцию **${faction.label}** одобрена! ${faction.emoji}`
                    : `Ваша заявка на вступление во фракцию **${faction.label}** была отклонена.`
            )
            .addFields(
                { name: '📋 Фракция', value: `${faction.emoji} ${faction.label}`, inline: true },
                { name: '👤 Администратор', value: interaction.user.tag, inline: true },
                { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();

        try {
            await targetUser.send({ embeds: [resultEmbed] });
        } catch (error) {
            logger.warn(`Не удалось отправить результат пользователю ${targetUser.user.tag}`, error);
        }

        const statusEmoji = isApproved ? '✅' : '❌';
        const statusText = isApproved ? 'одобрена' : 'отклонена';
        
        await interaction.update({
            content: `${statusEmoji} Заявка от **${targetUser.user.tag}** ${statusText} администратором **${interaction.user.tag}**`,
            embeds: [],
            components: []
        });

        // ===== ЛОГИРОВАНИЕ =====
        if (LOG_CHANNEL_ID) {
            try {
                const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(isApproved ? '#00FF00' : '#FF0000')
                        .setTitle(`📋 Заявка ${isApproved ? 'одобрена' : 'отклонена'}`)
                        .setDescription(`Заявка от ${targetUser.user.tag} на фракцию ${faction.label}`)
                        .addFields(
                            { name: 'Статус', value: isApproved ? '✅ Одобрена' : '❌ Отклонена' },
                            { name: 'Администратор', value: interaction.user.tag }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (error) {
                logger.error(`Ошибка логирования:`, error);
            }
        }

        logger.info(`Заявка ${isApproved ? 'одобрена' : 'отклонена'}`, {
            userId: targetUser.user.id,
            faction: factionValue,
            adminId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
};
