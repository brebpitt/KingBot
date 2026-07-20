
import { EmbedBuilder } from 'discord.js';

// Хранилище ролей (временное, замените на БД)
const roleStore = new Map();

export async function handleRoleButton(interaction) {
    // Проверяем, что это кнопка роли
    if (!interaction.customId.startsWith('role_')) return;

    await interaction.deferReply({ ephemeral: true });

    const roleId = interaction.customId.replace('role_', '');
    const member = interaction.member;
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
        return interaction.editReply({
            content: '❌ Роль не найдена! Возможно, она была удалена.',
            ephemeral: true
        });
    }

    // Проверяем, есть ли уже роль у пользователя
    const hasRole = member.roles.cache.has(roleId);

    try {
        if (hasRole) {
            // Удаляем роль
            await member.roles.remove(role);
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ Роль удалена')
                .setDescription(`Роль **${role.name}** была удалена у вас`)
                .setFooter({ text: 'Организации 01 | King Mobile' })
                .setTimestamp();

            await interaction.editReply({ 
                embeds: [embed], 
                ephemeral: true 
            });
        } else {
            // Выдаём роль
            await member.roles.add(role);
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Роль выдана')
                .setDescription(`Вы получили роль **${role.name}**`)
                .setFooter({ text: 'Организации 01 | King Mobile' })
                .setTimestamp();

            await interaction.editReply({ 
                embeds: [embed], 
                ephemeral: true 
            });
        }
    } catch (error) {
        console.error('Ошибка управления ролью:', error);
        await interaction.editReply({
            content: '❌ Ошибка при изменении роли. Проверьте, что бот имеет права на управление этой ролью и роль находится ниже его роли.',
            ephemeral: true
        });
    }
}

// Обработчик меню выбора ролей
export async function handleRoleMenu(interaction) {
    if (interaction.customId !== 'role_menu') return;

    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const selectedRoles = interaction.values;
    const guildId = interaction.guildId;

    // Получаем все доступные роли из хранилища
    const availableRoles = await getRolesFromDB(guildId);
    const availableRoleIds = availableRoles.map(r => r.id);

    // Определяем роли для удаления (те, что есть, но не выбраны)
    const rolesToRemove = member.roles.cache.filter(r => 
        availableRoleIds.includes(r.id) && !selectedRoles.includes(r.id)
    );

    // Определяем роли для добавления (те, что выбраны, но ещё не выданы)
    const rolesToAdd = selectedRoles.filter(id => 
        !member.roles.cache.has(id)
    );

    try {
        // Удаляем роли
        if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove);
        }
        
        // Добавляем роли
        if (rolesToAdd.length > 0) {
            const addRoles = rolesToAdd.map(id => interaction.guild.roles.cache.get(id)).filter(r => r);
            await member.roles.add(addRoles);
        }

        // Формируем ответ
        const addedNames = rolesToAdd
            .map(id => interaction.guild.roles.cache.get(id)?.name)
            .filter(r => r);
        
        const removedNames = rolesToRemove
            .map(r => r.name)
            .filter(r => r);

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('✅ Роли обновлены')
            .setTimestamp()
            .setFooter({ text: 'Организации 01 | King Mobile' });

        if (addedNames.length > 0) {
            embed.addFields({ 
                name: '➕ Добавлено', 
                value: addedNames.map(n => `• ${n}`).join('\n'), 
                inline: true 
            });
        }

        if (removedNames.length > 0) {
            embed.addFields({ 
                name: '➖ Удалено', 
                value: removedNames.map(n => `• ${n}`).join('\n'), 
                inline: true 
            });
        }

        if (addedNames.length === 0 && removedNames.length === 0) {
            embed.setDescription('Ваши роли не изменились');
        }

        await interaction.editReply({ embeds: [embed], ephemeral: true });

    } catch (error) {
        console.error('Ошибка управления ролями:', error);
        await interaction.editReply({
            content: '❌ Ошибка при изменении ролей. Проверьте права бота.',
            ephemeral: true
        });
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ХРАНИЛИЩЕМ ---

// Получить роли из хранилища
async function getRolesFromDB(guildId) {
    if (!roleStore.has(guildId)) {
        roleStore.set(guildId, []);
    }
    return roleStore.get(guildId);
}

// Добавить роль в хранилище
export async function addRoleToStore(guildId, roleData) {
    if (!roleStore.has(guildId)) {
        roleStore.set(guildId, []);
    }
    const roles = roleStore.get(guildId);
    if (!roles.find(r => r.id === roleData.id)) {
        roles.push(roleData);
        return true;
    }
    return false;
}

// Удалить роль из хранилища
export async function removeRoleFromStore(guildId, roleId) {
    if (!roleStore.has(guildId)) return false;
    const roles = roleStore.get(guildId);
    const filtered = roles.filter(r => r.id !== roleId);
    if (filtered.length !== roles.length) {
        roleStore.set(guildId, filtered);
        return true;
    }
    return false;
}

// Получить стиль кнопки из цвета роли
export function getButtonStyleFromColor(color) {
    if (!color) return 'Primary';
    
    // Преобразуем цвет в HEX
    const hex = color.toString(16).padStart(6, '0');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Определяем стиль на основе цвета
    if (r > 200 && g < 100 && b < 100) return 'Danger';
    if (r < 100 && g > 200 && b < 100) return 'Success';
    if (r > 200 && g > 200 && b < 100) return 'Warning';
    return 'Primary';
            }
