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
            .setName("очистить")
            .setDescription("Очистить все роли пользователя")
            .addUserOption(opt => opt
                .setName("пользователь")
                .setDescription("Пользователь для очистки")
                .setRequired(true)
            )
        ),

    async execute(interaction) {
        // Проверка прав
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

            await interaction.deferReply({ ephemeral: true });

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎭 Выберите свою роль')
                .setDescription('Выберите роль, которая вам подходит. Вы можете изменить выбор в любой момент.')
                .setFooter({ text: 'Организации 01 | King Mobile' })
                .setTimestamp();

            let row;

            if (type === 'buttons') {
                // Панель с кнопками
                const roles = await getRolesFromDB(interaction.guildId);
                if (!roles || roles.length === 0) {
                    return interaction.editReply({
                        content: '❌ Сначала добавьте роли командой `/роли добавить`'
                    });
                }

                const buttons = roles.map(r => 
                    new ButtonBuilder()
                        .setCustomId(`role_${r.id}`)
                        .setLabel(r.name)
                        .setStyle(r.color || ButtonStyle.Primary)
                );

                // Разбиваем по 5 кнопок в ряд
                const rows = [];
                for (let i = 0; i < buttons.length; i += 5) {
                    const row = new ActionRowBuilder();
                    buttons.slice(i, i + 5).forEach(btn => row.addComponents(btn));
                    rows.push(row);
                }

                await channel.send({ embeds: [embed], components: rows });
                await interaction.editReply({ 
                    content: `✅ Панель с кнопками создана в канале ${channel}!`,
                    ephemeral: true 
                });

            } else {
                // Панель с меню
                const roles = await getRolesFromDB(interaction.guildId);
                if (!roles || roles.length === 0) {
                    return interaction.editReply({
                        content: '❌ Сначала добавьте роли командой `/роли добавить`'
                    });
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('role_menu')
                    .setPlaceholder('Выберите роль...')
                    .setMinValues(type === 'menu_single' ? 1 : 1)
                    .setMaxValues(type === 'menu_multi' ? roles.length : 1);

                roles.forEach(r => {
                    selectMenu.addOptions({
                        label: r.name,
                        value: r.id,
                        description: r.description || `Роль ${r.name}`,
                        emoji: r.emoji || '🎭'
                    });
                });

                const row = new ActionRowBuilder().addComponents(selectMenu);
                await channel.send({ embeds: [embed], components: [row] });
                
                await interaction.editReply({ 
                    content: `✅ Панель с меню создана в канале ${channel}!`,
                    ephemeral: true 
                });
            }
        }

        // --- ДОБАВЛЕНИЕ РОЛИ ---
        else if (subcommand === 'добавить') {
            const role = interaction.options.getRole('роль');
            const description = interaction.options.getString('описание') || '';

            await addRoleToDB(interaction.guildId, {
                id: role.id,
                name: role.name,
                color: getButtonStyleFromColor(role.color),
                description: description,
                emoji: '🎭'
            });

            await interaction.reply({
                content: `✅ Роль **${role.name}** добавлена в систему!`,
                ephemeral: true
            });
        }

        // --- УДАЛЕНИЕ РОЛИ ---
        else if (subcommand === 'удалить') {
            const role = interaction.options.getRole('роль');
            await removeRoleFromDB(interaction.guildId, role.id);

            await interaction.reply({
                content: `✅ Роль **${role.name}** удалена из системы!`,
                ephemeral: true
            });
        }

        // --- ОЧИСТКА РОЛЕЙ ПОЛЬЗОВАТЕЛЯ ---
        else if (subcommand === 'очистить') {
            const user = interaction.options.getUser('пользователь');
            const member = await interaction.guild.members.fetch(user.id);

            // Получаем все роли, кроме @everyone и административных
            const rolesToRemove = member.roles.cache.filter(r => 
                r.id !== interaction.guild.id && // не @everyone
                !r.permissions.has(PermissionsBitField.Flags.Administrator) // не админские
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

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Временное хранилище (замените на базу данных)
const roleStore = new Map();

async function getRolesFromDB(guildId) {
    if (!roleStore.has(guildId)) {
        roleStore.set(guildId, []);
    }
    return roleStore.get(guildId);
}

async function addRoleToDB(guildId, roleData) {
    if (!roleStore.has(guildId)) {
        roleStore.set(guildId, []);
    }
    const roles = roleStore.get(guildId);
    if (!roles.find(r => r.id === roleData.id)) {
        roles.push(roleData);
    }
}

async function removeRoleFromDB(guildId, roleId) {
    if (!roleStore.has(guildId)) return;
    const roles = roleStore.get(guildId);
    roleStore.set(guildId, roles.filter(r => r.id !== roleId));
}

function getButtonStyleFromColor(color) {
    if (!color) return ButtonStyle.Primary;
    // Преобразуем цвет в стиль кнопки
    const hex = color.toString(16).padStart(6, '0');
    if (hex.startsWith('ff')) return ButtonStyle.Danger;
    if (hex.startsWith('00')) return ButtonStyle.Success;
    return ButtonStyle.Primary;
          }
