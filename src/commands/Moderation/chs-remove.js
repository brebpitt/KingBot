import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, Colors } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// ===== НАСТРОЙКИ (ЗАМЕНИТЕ НА СВОИ) =====
const MODERATION_CHANNEL_ID = '1528870028449939568';
const ADMIN_ROLE_ID = '1510803430166495295';
const LOG_CHANNEL_ID = '1528553736929284197';

// ===== ВИДЫ ЧС (для отображения) =====
const CHS_TYPES = {
    'ЧСЛ': { label: 'ЧСЛ', emoji: '🔴', color: Colors.Red },
    'ЧСП': { label: 'ЧСП', emoji: '🟠', color: Colors.Orange },
    'ЧСГОС': { label: 'ЧСГОС', emoji: '🟡', color: Colors.Gold },
    'ЧССС': { label: 'ЧССС', emoji: '🟢', color: Colors.Green }
};

// ===== ХРАНИЛИЩЕ ЧС (ИМПОРТ ИЗ ОСНОВНОЙ КОМАНДЫ) =====
// В реальном проекте используйте общее хранилище/БД
// Здесь для примера - глобальная переменная
let activePenalties = new Map();

// Функция для установки хранилища из основной команды
export function setPenaltiesStore(store) {
    activePenalties = store;
}

// ===== КОМАНДА =====
export default {
    data: new SlashCommandBuilder()
        .setName('чс_снять')
        .setDescription('Снять ЧС с игрока (только для администраторов)')
        .addUserOption(option =>
            option.setName('игрок')
                .setDescription('Игрок, с которого снимается ЧС')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('вид')
                .setDescription('Какой именно вид ЧС снять (если несколько)')
                .setRequired(false)
                .addChoices(
                    { name: '🔴 ЧСЛ', value: 'ЧСЛ' },
                    { name: '🟠 ЧСП', value: 'ЧСП' },
                    { name: '🟡 ЧСГОС', value: 'ЧСГОС' },
                    { name: '🟢 ЧССС', value: 'ЧССС' },
                    { name: '🔄 Все виды', value: 'ALL' }
                )
        )
        .addStringOption(option =>
            option.setName('причина_снятия')
                .setDescription('Причина снятия ЧС')
                .setRequired(false)
                .setMaxLength(300)
        )
        .addAttachmentOption(option =>
            option.setName('доказательства')
                .setDescription('Прикрепите доказательства (скриншот, видео)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        // Обработка кнопок
        if (interaction.isButton()) {
            await this.handleButton(interaction);
            return;
        }

        // ===== ОСНОВНАЯ ЛОГИКА КОМАНДЫ =====
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ошибка отложенного ответа для команды снятия ЧС`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            return;
        }

        // Получаем данные
        const targetUser = interaction.options.getUser('игрок');
        const chsType = interaction.options.getString('вид') || 'ALL';
        const removeReason = interaction.options.getString('причина_снятия') || 'Не указана';
        const attachment = interaction.options.getAttachment('доказательства');

        // Проверка: нельзя снять ЧС с себя
        if (targetUser.id === interaction.user.id) {
            return InteractionHelper.safeEditReply(interaction, {
                content: '❌ Нельзя снять ЧС с самого себя!',
                ephemeral: true
            });
        }

        // Проверяем наличие ЧС у игрока
        if (!activePenalties.has(targetUser.id)) {
            return InteractionHelper.safeEditReply(interaction, {
                content: `✅ У игрока **${targetUser.tag}** нет активных ЧС.`,
                ephemeral: true
            });
        }

        const userPenalties = activePenalties.get(targetUser.id);
        
        // Фильтруем ЧС для снятия
        let penaltiesToRemove = [];
        let remainingPenalties = [];

        if (chsType === 'ALL') {
            // Снимаем все ЧС
            penaltiesToRemove = [...userPenalties];
            remainingPenalties = [];
        } else {
            // Снимаем только конкретный вид
            penaltiesToRemove = userPenalties.filter(p => p.type === chsType);
            remainingPenalties = userPenalties.filter(p => p.type !== chsType);
        }

        if (penaltiesToRemove.length === 0) {
            const chsInfo = CHS_TYPES[chsType];
            return InteractionHelper.safeEditReply(interaction, {
                content: `❌ У игрока **${targetUser.tag}** нет активных ЧС вида **${chsInfo ? chsInfo.emoji : ''} ${chsType}**.`,
                ephemeral: true
            });
        }

        // ===== ОБНОВЛЯЕМ ХРАНИЛИЩЕ =====
        if (remainingPenalties.length > 0) {
            activePenalties.set(targetUser.id, remainingPenalties);
        } else {
            activePenalties.delete(targetUser.id);
        }

        // ===== ФОРМИРУЕМ EMBED ДЛЯ КАНАЛА =====
        const removedTypes = penaltiesToRemove.map(p => p.type).join(', ');
        const chsInfo = CHS_TYPES[penaltiesToRemove[0].type] || { emoji: '✅', color: Colors.Green };

        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✅ Снятие ЧС')
            .setDescription(`👤 С игрока **${targetUser.tag}** снято ЧС`)
            .addFields(
                { name: '📋 Снятые виды', value: removedTypes, inline: true },
                { name: '📅 Количество', value: `${penaltiesToRemove.length} запись(ей)`, inline: true },
                { name: '👮 Снял', value: interaction.user.tag, inline: true },
                { name: '📝 Причина снятия', value: removeReason, inline: false }
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ 
                text: 'Пожалуйста, не нарушайте правила игры!',
                iconURL: interaction.guild.iconURL()
            })
            .setTimestamp();

        // Если есть доказательства - добавляем
        if (attachment?.url) {
            embed.setImage(attachment.url);
        }

        // ===== КНОПКИ ДЛЯ УПРАВЛЕНИЯ =====
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`chs_restore_${targetUser.id}_${Date.now()}`)
                    .setLabel('↩️ Восстановить ЧС')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`chs_info_${targetUser.id}`)
                    .setLabel('ℹ️ Информация')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`chs_dm_${targetUser.id}`)
                    .setLabel('✉️ Написать в ЛС')
                    .setStyle(ButtonStyle.Primary)
            );

        // ===== ОТПРАВКА В КАНАЛ =====
        try {
            const modChannel = await interaction.guild.channels.fetch(MODERATION_CHANNEL_ID);
            if (modChannel) {
                await modChannel.send({
                    content: `🔔 ЧС снято!`,
                    embeds: [embed],
                    components: [row]
                });
                logger.info(`ЧС снято с пользователя ${targetUser.tag}`, {
                    userId: targetUser.id,
                    types: removedTypes,
                    moderatorId: interaction.user.id,
                    guildId: interaction.guildId
                });
            }
        } catch (error) {
            logger.error(`Ошибка отправки в канал ЧС:`, error);
        }

        // ===== ОТВЕТ ПОЛЬЗОВАТЕЛЮ =====
        const userEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✅ ЧС успешно снято!')
            .setDescription(`С игрока **${targetUser.tag}** снято ЧС **${removedTypes}**`)
            .addFields(
                { name: '📝 Причина снятия', value: removeReason, inline: false },
                { name: '👮 Снял', value: interaction.user.tag, inline: true }
            )
            .setFooter({ text: 'Сообщение отправлено в канал модерации' })
            .setTimestamp();

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [userEmbed],
            ephemeral: true
        });

        // ===== ОТПРАВКА В ЛС ИГРОКУ =====
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('✅ С вас снято ЧС')
                .setDescription(`Администратор **${interaction.user.tag}** снял с вас ЧС`)
                .addFields(
                    { name: '📋 Снятые виды', value: removedTypes, inline: true },
                    { name: '📝 Причина снятия', value: removeReason, inline: false },
                    { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            await targetUser.send({ embeds: [dmEmbed] });
        } catch (error) {
            logger.warn(`Не удалось отправить ЛС пользователю ${targetUser.tag}`, error);
        }

        // ===== ЛОГИРОВАНИЕ =====
        if (LOG_CHANNEL_ID) {
            try {
                const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(Colors.Green)
                        .setTitle('📋 Лог снятия ЧС')
                        .addFields(
                            { name: '👤 Игрок', value: targetUser.tag, inline: true },
                            { name: '📋 Снятые виды', value: removedTypes, inline: true },
                            { name: '👮 Снял', value: interaction.user.tag, inline: true },
                            { name: '📝 Причина', value: removeReason, inline: false }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (error) {
                logger.error(`Ошибка логирования:`, error);
            }
        }
    },

    // ===== ОБРАБОТКА КНОПОК =====
    async handleButton(interaction) {
        const customId = interaction.customId;
        const [action, userId, timestamp] = customId.split('_');

        // Проверка прав
        const member = interaction.member;
        const hasAdminRole = member.roles.cache.has(ADMIN_ROLE_ID);
        const hasAdminPerms = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasAdminRole && !hasAdminPerms) {
            return interaction.reply({
                content: '❌ У вас нет прав для управления ЧС!',
                ephemeral: true
            });
        }

        // Получаем пользователя
        let targetMember;
        try {
            targetMember = await interaction.guild.members.fetch(userId);
        } catch (error) {
            return interaction.reply({
                content: '❌ Пользователь не найден!',
                ephemeral: true
            });
        }

        // === ОБРАБОТКА: Информация ===
        if (action === 'chs_info') {
            const penalties = activePenalties.get(userId) || [];
            if (penalties.length === 0) {
                return interaction.reply({
                    content: `✅ У игрока **${targetMember.user.tag}** нет активных ЧС.`,
                    ephemeral: true
                });
            }

            const infoEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📋 Информация о ЧС игрока ${targetMember.user.tag}`)
                .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }));

            penalties.forEach((p, index) => {
                const chsInfo = CHS_TYPES[p.type] || { emoji: '⚪', color: Colors.Grey };
                infoEmbed.addFields({
                    name: `#${index + 1} ${chsInfo.emoji} ${p.type}`,
                    value: `📅 Срок: \`${p.duration}\`\n📝 Причина: ${p.reason}\n👮 Выдал: ${p.moderator}\n📅 Дата: <t:${Math.floor(p.timestamp / 1000)}:F>`,
                    inline: false
                });
            });

            infoEmbed.setFooter({ text: `Всего записей: ${penalties.length}` });

            return interaction.reply({
                embeds: [infoEmbed],
                ephemeral: true
            });
        }

        // === ОБРАБОТКА: Написать в ЛС ===
        if (action === 'chs_dm') {
            try {
                await targetMember.send({
                    content: `📩 Вам написал администратор **${interaction.user.tag}** по поводу вашего ЧС.\nОжидайте ответа в этом чате.`
                });
                return interaction.reply({
                    content: `✅ Сообщение отправлено пользователю **${targetMember.user.tag}**!`,
                    ephemeral: true
                });
            } catch (error) {
                return interaction.reply({
                    content: `❌ Не удалось отправить ЛС пользователю **${targetMember.user.tag}** (возможно, ЛС закрыты).`,
                    ephemeral: true
                });
            }
        }

        // === ОБРАБОТКА: Восстановить ЧС ===
        if (action === 'chs_restore') {
            // Простое восстановление - добавляем обратно (в реальном проекте нужно хранить историю)
            // Здесь просто уведомление, что восстановление недоступно
            return interaction.reply({
                content: '⚠️ Функция восстановления ЧС находится в разработке.\nДля повторной выдачи используйте команду `/чс`.',
                ephemeral: true
            });
        }
    }
};
