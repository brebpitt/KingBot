import { EmbedBuilder } from 'discord.js';

// Хранилище выбранных ролей пользователей
const userRoles = new Map();

export async function handleRoleSelect(interaction) {
    if (interaction.customId !== 'role_menu') return;

    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const selectedRoles = interaction.values;
    const guildId = interaction.guildId;

    // Получаем все доступные роли из БД
    const availableRoles = await getRolesFromDB(guildId);
    const availableRoleIds = availableRoles.map(r => r.id);

    // Удаляем все роли, которые есть в системе
    const rolesToRemove = member.roles.cache.filter(r => 
        availableRoleIds.includes(r.id) && !selectedRoles.includes(r.id)
    );

    // Добавляем выбранные роли
    const rolesToAdd = selectedRoles.filter(id => 
        !member.roles.cache.has(id)
    );

    try {
        if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove);
        }
        
        if (rolesToAdd.length > 0) {
            await member.roles.add(rolesToAdd);
        }

        // Сохраняем выбор пользователя
        userRoles.set(`${guildId}_${member.id}`, selectedRoles);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Роли обновлены')
            .setDescription(`Ваши роли успешно обновлены!`)
            .addFields(
                { name: '➕ Добавлено', value: rolesToAdd.length > 0 ? 
                    rolesToAdd.map(id => `<@&${id}>`).join(', ') : 'Нет', 
                    inline: true },
                { name: '➖ Удалено', value: rolesToRemove.size > 0 ? 
                    rolesToRemove.map(r => r.name).join(', ') : 'Нет', 
                    inline: true }
            )
            .setFooter({ text: 'Организации 01 | King Mobile' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], ephemeral: true });

    } catch (error) {
        console.error('Ошибка управления ролями:', error);
        await interaction.editReply({
            content: '❌ Ошибка при изменении ролей. Проверьте права бота.',
            ephemeral: true
        });
    }
}

export async function handleRoleButton(interaction) {
    if (!interaction.customId.startsWith('role_')) return;

    await interaction.deferReply({ ephemeral: true });

    const roleId = interaction.customId.replace('role_', '');
    const member = interaction.member;
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
        return interaction.editReply({
            content: '❌ Роль не найдена!',
            ephemeral: true
        });
    }

    const hasRole = member.roles.cache.has(roleId);

    try {
        if (hasRole) {
            await member.roles.remove(role);
            await interaction.editReply({
                content: `✅ Роль **${role.name}** удалена!`,
                ephemeral: true
            });
        } else {
            await member.roles.add(role);
            await interaction.editReply({
                content: `✅ Роль **${role.name}** выдана!`,
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Ошибка выдачи роли:', error);
        await interaction.editReply({
            content: '❌ Ошибка при изменении роли. Проверьте права бота.',
            ephemeral: true
        });
    }
}

// Вспомогательная функция (заменить на реальную БД)
async function getRolesFromDB(guildId) {
    const roleStore = new Map(); // Временно
    if (!roleStore.has(guildId)) {
        roleStore.set(guildId, []);
    }
    return roleStore.get(guildId);
}
