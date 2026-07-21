import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, Colors } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// ===== НАСТРОЙКИ (ЗАМЕНИТЕ НА СВОИ) =====
const MODERATION_CHANNEL_ID = '1528870028449939568';
const ADMIN_ROLE_ID = '1510803547707412636';
const LOG_CHANNEL_ID = '1528553736929284197';

// ===== ВИДЫ ЧС =====
const CHS_TYPES = {
    'ЧСЛ': { 
        label: 'ЧСЛ', 
        emoji: '🔴', 
        color: Colors.Red,
        description: 'Черный Список Лидеров'
    },
    'ЧСП': { 
        label: 'ЧСП', 
        emoji: '🟠', 
        color: Colors.Orange,
        description: 'Черный Список Проекта'
    },
    'ЧСГОС': { 
        label: 'ЧСГОС', 
        emoji: '🟡', 
        color: Colors.Gold,
        description: 'Черный Список ГОС'
    },
    'ЧССС': { 
        label: 'ЧССС', 
        emoji: '🟢', 
        color: Colors.Green,
        description: 'Черный Список Старшего Состава'
    },
    // ⬇️ НОВЫЙ ВИД ЧСА ⬇️
    'ЧСА': { 
        label: 'ЧСА', 
        emoji: '⚫', 
        color: Colors.DarkButNotBlack,
        description: 'Черный Список Администрации'
    }
};

// ===== ХРАНИЛИЩЕ ЧС (в памяти, для продакшена используйте БД) =====
const activePenalties = new Map(); // key: userId, value: массив записей

// ===== КОМАНДА =====
export default {
    data: new SlashCommandBuilder()
        .setName('чс')
        .setDescription('Выдать игроку ЧС (только для администраторов)')
        .addUserOption(option =>
            option.setName('игрок')
                .setDescription('Игрок, которому выдаётся ЧС')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('вид')
                .setDescription('Вид ЧС')
                .setRequired(true)
                .addChoices(
                    { name: '🔴 ЧСЛ', value: 'ЧСЛ' },
                    { name: '🟠 ЧСП', value: 'ЧСП' },
                    { name: '🟡 ЧСГОС', value: 'ЧСГОС' },
                    { name: '🟢 ЧССС', value: 'ЧССС' },
                    { name: '⚫ ЧСА', value: 'ЧСА' } // ⬅️ Добавлен ЧСА в выбор
                )
        )
        .addStringOption(option =>
            option.setName('срок')
                .setDescription('Срок ЧС (например: 7д, 1м, 1г)')
                .setRequired(true)
                .setMaxLength(20)
        )
        .addStringOption(option =>
            option.setName('причина')
                .setDescription('Причина выдачи ЧС')
                .setRequired(true)
                .setMaxLength(500)
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
            logger.warn(`Ошибка отложенного ответа для команды ЧС`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            return;
        }

        // Получаем данные
        const targetUser = interaction.options.getUser('игрок');
        const chsType = interaction.options.getString('вид');
        const duration = interaction.options.getString('срок');
        const reason = interaction.options.getString('причина');
        const attachment = interaction.options.getAttachment('доказательства');

        // Проверка: нельзя выдать ЧС самому себе
        if (targetUser.id === interaction.user.id) {
            return InteractionHelper.safeEditReply(interaction, {
                content: '❌ Нельзя выдать ЧС самому себе!',
                ephemeral: true
            });
        }

        // Проверка: нельзя выдать ЧС боту
        if (targetUser.bot) {
            return InteractionHelper.safeEditReply(interaction, {
                content: '❌ Нельзя выдать ЧС боту!',
                ephemeral: true
            });
        }

        // Получаем информацию о виде ЧС
        const chsInfo = CHS_TYPES[chsType];
        if (!chsInfo) {
            return InteractionHelper.safeEditReply(interaction, {
                content: '❌ Неизвестный вид ЧС!',
                ephemeral: true
            });
        }

        // Получаем участника для проверки ролей
        let member;
        try {
            member = await interaction.guild.members.fetch(targetUser.id);
        } catch (error) {
            return InteractionHelper.safeEditReply(interaction, {
                content: '❌ Пользователь не найден на сервере!',
                ephemeral: true
            });
        }

        // ⬇️ ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА ДЛЯ ЧСА ⬇️
        // ЧСА может выдать только администратор
        if (chsType === 'ЧСА') {
            const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE_ID) || 
                           interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isAdmin) {
                return InteractionHelper.safeEditReply(interaction, {
                    content: '❌ **ЧСА** может выдавать только администрация!',
                    ephemeral: true
                });
            }
        }

        // Проверка: нельзя выдать ЧС администратору (кроме ЧСА)
        if (chsType !== 'ЧСА' && member.roles.cache.has(ADMIN_ROLE_ID)) {
            return InteractionHelper.safeEditReply(interaction, {
                content: '❌ Нельзя выдать ЧС администратору! Используйте ЧСА для администраторов.',
                ephemeral: true
            });
        }

        // ===== СОХРАНЯЕМ В БАЗУ =====
        const penaltyData = {
            type: chsType,
            duration: duration,
            reason: reason,
            moderator: interaction.user.tag,
            moderatorId: interaction.user.id,
            date: new Date().toISOString(),
            timestamp: Date.now(),
            attachment: attachment?.url || null,
            active: true
        };

        if (!activePenalties.has(targetUser.id)) {
            activePenalties.set(targetUser.id, []);
        }
        activePenalties.get(targetUser.id).push(penaltyData);

        // ===== ФОРМИРУЕМ EMBED ДЛЯ КАНАЛА =====
        const embed = new EmbedBuilder()
            .setColor(chsInfo.color)
            .setTitle(`${chsInfo.emoji} Занесение в ЧС`)
            .setDescription(`👤 Игрок **${targetUser.tag}** был занесён в **${chsType}**`)
            .addFields(
                { name: '📋 Вид ЧС', value: `${chsInfo.emoji} **${chsType}**`, inline: true },
                { name: '📅 Срок', value: `\`${duration}\``, inline: true },
                { name: '👮 Выдал', value: interaction.user.tag, inline: true },
                { name: '📝 Причина', value: reason, inline: false }
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ 
                text: chsType === 'ЧСА' ? '⚠️ ЧСА - только для администрации!' : 'Пожалуйста, не нарушайте правила игры!',
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
                    .setCustomId(`chs_remove_${targetUser.id}_${Date.now()}`)
                    .setLabel('🗑️ Снять ЧС')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`chs_info_${targetUser.id}`)
                    .setLabel('ℹ️ Информация')
                    .setStyle(ButtonStyle.Secondary),
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
                    content: chsType === 'ЧСА' 
                        ? `⚠️ **ВНИМАНИЕ!** Выдано ЧСА! <@&${ADMIN_ROLE_ID}>`
                        : `🔔 <@&${ADMIN_ROLE_ID}> Новое ЧС!`,
                    embeds: [embed],
                    components: [row]
                });
                logger.info(`ЧС выдано пользователю ${targetUser.tag}`, {
                    userId: targetUser.id,
                    type: chsType,
                    moderatorId: interaction.user.id,
                    guildId: interaction.guildId
                });
            }
        } catch (error) {
            logger.error(`Ошибка отправки в канал ЧС:`, error);
            return InteractionHelper.safeEditReply(interaction, {
                content: '❌ Ошибка отправки в канал! Проверьте ID канала.',
                ephemeral: true
            });
        }

        // ===== ОТВЕТ ПОЛЬЗОВАТЕЛЮ =====
        const userEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✅ ЧС успешно выдано!')
            .setDescription(`Игроку **${targetUser.tag}** выдано ЧС **${chsType}**`)
            .addFields(
                { name: '📅 Срок', value: `\`${duration}\``, inline: true },
                { name: '📝 Причина', value: reason, inline: false }
            )
            .setFooter({ text: 'Сообщение отправлено в канал модерации' })
            .setTimestamp();

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [userEmbed],
            ephemeral: true
        });

        // ⬇️ ОТПРАВКА В ЛС ДЛЯ ЧСА ⬇️
        if (chsType === 'ЧСА') {
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(Colors.DarkButNotBlack)
                    .setTitle('⚫ Вы получили ЧСА')
                    .setDescription(`Вы были занесены в **Черный Список Администрации**`)
                    .addFields(
                        { name: '📅 Срок', value: `\`${duration}\``, inline: true },
                        { name: '📝 Причина', value: reason, inline: false },
                        { name: '👮 Выдал', value: interaction.user.tag, inline: true }
                    )
                    .setFooter({ text: 'Вопросы решаются через форму на сайте.' })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
                logger.info(`Отправлено ЛС уведомление о ЧСА для ${targetUser.tag}`);
            } catch (error) {
                logger.warn(`Не удалось отправить ЛС уведомление о ЧСА для ${targetUser.tag}:`, error);
                // Не прерываем выполнение, если ЛС закрыты
            }
        }

        // ===== ЛОГИРОВАНИЕ =====
        if (LOG_CHANNEL_ID) {
            try {
                const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(chsInfo.color)
                        .setTitle('📋 Лог выдачи ЧС')
                        .addFields(
                            { name: '👤 Игрок', value: targetUser.tag, inline: true },
                            { name: '📋 Вид ЧС', value: chsType, inline: true },
                            { name: '📅 Срок', value: duration, inline: true },
                            { name: '👮 Выдал', value: interaction.user.tag, inline: true },
                            { name: '📝 Причина', value: reason, inline: false }
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

        // === ОБРАБОТКА: Снять ЧС ===
        if (action === 'chs_remove') {
            if (!activePenalties.has(userId)) {
                return interaction.reply({
                    content: `✅ У игрока **${targetMember.user.tag}** нет активных ЧС.`,
                    ephemeral: true
                });
            }

            // Удаляем все ЧС игрока
            activePenalties.delete(userId);

            // Обновляем сообщение
            const updatedEmbed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('✅ ЧС снято')
                .setDescription(`С игрока **${targetMember.user.tag}** сняты все ЧС`)
                .addFields(
                    { name: '👮 Снял', value: interaction.user.tag, inline: true },
                    { name: '📅 Дата', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            await interaction.update({
                content: `✅ ЧС сняты администратором **${interaction.user.tag}**`,
                embeds: [updatedEmbed],
                components: []
            });

            // Отправляем уведомление пользователю
            try {
                await targetMember.send({
                    content: `✅ С вас сняты все ЧС администратором **${interaction.user.tag}**.`
                });
            } catch (error) {
                // Игнорируем, если ЛС закрыты
            }

            logger.info(`ЧС сняты с пользователя ${targetMember.user.tag}`, {
                userId: targetMember.user.id,
                adminId: interaction.user.id,
                guildId: interaction.guildId
            });

            return;
        }
    }
};
