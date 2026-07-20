import { 
    SlashCommandBuilder, 
    PermissionsBitField, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} from 'discord.js';
import { 
    addRoleToStore, 
    removeRoleFromStore, 
    getButtonStyleFromColor,
    getRolesFromDB 
} from '../handlers/roleButton.js';

export default {
    data: new SlashCommandBuilder()
        .setName("роли")
        .setDescription("Управление системой ролей")
        .addSubcommand(sub => sub
            .setName("создать")
            .setDescription("Создать панель выдачи ролей")
            .addChannelOption(opt => opt
                .setName("канал")
                .setDescription("Канал для панели")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName("тип")
                .setDescription("Тип панели")
                .setRequired(true)
                .addChoices(
                    { name: "📋 Меню (выбор одной роли)", value: "menu_single" },
                    { name: "📋 Меню (выбор нескольких ролей)", value: "menu_multi" },
                    { name: "🎛️ Кнопки", value: "buttons" }
                )
            )
        )
        .addSubcommand(sub => sub
            .setName("добавить")
            .setDescription("Добавить роль в панель")
            .addRoleOption(opt => opt
                .setName("роль")
                .setDescription("Роль для выдачи")
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName("описание")
                .setDescription("Описание роли")
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName("эмодзи")
                .setDescription("Эмодзи для роли")
                .setRequired(false)
            )
        )
        .addSubcommand(sub => sub
            .setName("удалить")
            .setDescription("Удалить роль из панели")
            .addRoleOption(opt => opt
                .setName("роль")
                .setDescription("Роль для удаления")
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName("список")
            .setDescription("Показать все роли в системе")
        )
        .addSubcommand(sub => sub
            .setName("очистить")
            .setDescription("Очистить все роли пользователя")
            .addUserOption(opt => opt
                .setName("пользователь")
                .setDescription("Пользователь для очистки")
                .setRequired(true)
            )
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ 
                content: '❌ У вас нет прав администратора!', 
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // --- СОЗДАНИЕ ПАНЕЛИ ---
        if (subcommand === 'создать') {
            const channel = interaction.options.getChannel('канал');
            const type = interaction.options.getString('тип');
            const roles = await getRolesFromDB(interaction.guildId);

            if (!roles || roles.length === 0) {
                return interaction.reply({
                    content: '❌ Сначала добавьте роли командой `/роли добавить`',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎭 Выберите свою роль')
                .setDescription('Выберите роль, которая вам подходит. Вы можете изменить выбор в любой момент.')
                .setFooter({ text: 'Организации 01 | King Mobile' })
                .setTimestamp();

            let components = [];

            if (type === 'buttons') {
                // Создаём кнопки для каждой роли
                const buttonRows = [];
                let currentRow = new ActionRowBuilder();

                roles.forEach((role, index) => {
                    const button = new ButtonBuilder()
                        .setCustomId(`role_${role.id}`)
                        .setLabel(role.name.length > 80 ? role.name.slice(0, 77) + '...' : role.name)
                        .setStyle(getButtonStyleFromColor(role.color))
                        .setEmoji(role.emoji || '🎭');

                    currentRow.addComponents(button);

                    // Если в ряду 5 кнопок или это последняя роль
                    if (currentRow.components.length === 5 || index === roles.length - 1) {
                        buttonRows.push(currentRow);
                        currentRow = new ActionRowBuilder();
                    }
                });

                components = buttonRows;

            } else {
                // Создаём меню
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('role_menu')
                    .setPlaceholder('Выберите роль...')
                    .setMinValues(type === 'menu_single' ? 1 : 1)
                    .setMaxValues(type === 'menu_multi' ? roles.length : 1);

                roles.forEach(r => {
                    selectMenu.addOptions({
                        label: r.name.length > 100 ? r.name.slice(0, 97) + '...' : r.name,
                        value: r.id,
                        description: r.description ? r.description.slice(0, 100) : `Роль ${r.name}`,
                        emoji: r.emoji || '🎭'
                    });
                });

                components = [new ActionRowBuilder().addComponents(selectMenu)];
            }

            await channel.send({ 
                embeds: [embed], 
                components: components 
            });
            
            await interaction.editReply({ 
                content: `✅ Панель ролей создана в канале ${channel}!`,
                ephemeral: true 
            });
        }

        // --- ДОБАВЛЕНИЕ РОЛИ ---
        else if (subcommand === 'добавить') {
            const role = interaction.options.getRole('роль');
            const description = interaction.options.getString('описание') || '';
            const emoji = interaction.options.getString('эмодзи') || '🎭';

            // Проверяем, не админская ли роль
            if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({
                    content: '❌ Нельзя добавлять административные роли!',
                    ephemeral: true
                });
            }

            const added = await addRoleToStore(interaction.guildId, {
                id: role.id,
                name: role.name,
                color: role.color,
                description: description,
                emoji: emoji
            });

            if (added) {
                await interaction.reply({
                    content: `✅ Роль **${role.name}** добавлена в систему!`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `ℹ️ Роль **${role.name}** уже есть в системе!`,
                    ephemeral: true
                });
            }
        }

        // --- УДАЛЕНИЕ РОЛИ ---
        else if (subcommand === 'удалить') {
            const role = interaction.options.getRole('роль');
            const removed = await removeRoleFromStore(interaction.guildId, role.id);

            if (removed) {
                await interaction.reply({
                    content: `✅ Роль **${role.name}** удалена из системы!`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `ℹ️ Роль **${role.name}** не найдена в системе!`,
                    ephemeral: true
                });
            }
        }

        // --- СПИСОК РОЛЕЙ ---
        else if (subcommand === 'список') {
            const roles = await getRolesFromDB(interaction.guildId);
            
            if (!roles || roles.length === 0) {
                return interaction.reply({
                    content: 'ℹ️ В системе нет добавленных ролей.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📋 Список ролей в системе')
                .setDescription(roles.map((r, i) => 
                    `${i + 1}. <@&${r.id}> ${r.emoji} - ${r.description || 'Нет описания'}`
                ).join('\n'))
                .setFooter({ text: `Всего ролей: ${roles.length}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // --- ОЧИСТКА РОЛЕЙ ПОЛЬЗОВАТЕЛЯ ---
        else if (subcommand === 'очистить') {
            const user = interaction.options.getUser('пользователь');
            const member = await interaction.guild.members.fetch(user.id);

            const rolesToRemove = member.roles.cache.filter(r => 
                r.id !== interaction.guild.id && 
                !r.permissions.has(PermissionsBitField.Flags.Administrator)
            );

            if (rolesToRemove.size === 0) {
                return interaction.reply({
                    content: `ℹ️ У пользователя ${user.tag} нет ролей для удаления.`,
                    ephemeral: true
                });
            }

            await member.roles.remove(rolesToRemove);
            
            await interaction.reply({
                content: `✅ У пользователя ${user.tag} удалены все роли (${rolesToRemove.size} шт.)`,
                ephemeral: true
            });
        }
    }
};
