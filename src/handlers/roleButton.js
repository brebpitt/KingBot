import { ButtonStyle, EmbedBuilder } from 'discord.js';

// --- ИМПОРТ ИЗ roles.js (как в вашем примере) ---
import { 
    getGuildRoles,
    getRoleById,
    addRoleToStore,
    removeRoleFromStore,
    isRoleInStore,
    getRoleCount,
    getButtonStyleFromColor,
    getRoleEmoji,
    getRoleDescription,
    getUserSystemRoles,
    hasUserSystemRole,
    clearGuildRoles
} from '../commands/roles.js';

// --- ХРАНИЛИЩЕ (временное, заменить на БД) ---
const roleStore = new Map();

// --- ФУНКЦИИ ДЛЯ РАБОТЫ С ХРАНИЛИЩЕМ ---

// Получить все роли с гильдии
export function getGuildRoles(guildId) {
    if (!roleStore.has(guildId)) {
        roleStore.set(guildId, []);
    }
    return roleStore.get(guildId);
}

// Получить роль по ID
export function getRoleById(guildId, roleId) {
    const roles = getGuildRoles(guildId);
    return roles.find(r => r.id === roleId);
}

// Добавить роль в хранилище
export function addRoleToStore(guildId, roleData) {
    const roles = getGuildRoles(guildId);
    if (!roles.find(r => r.id === roleData.id)) {
        roles.push(roleData);
        return true;
    }
    return false;
}

// Удалить роль из хранилища
export function removeRoleFromStore(guildId, roleId) {
    const roles = getGuildRoles(guildId);
    const filtered = roles.filter(r => r.id !== roleId);
    if (filtered.length !== roles.length) {
        roleStore.set(guildId, filtered);
        return true;
    }
    return false;
}

// Проверить, существует ли роль в хранилище
export function isRoleInStore(guildId, roleId) {
    const roles = getGuildRoles(guildId);
    return roles.some(r => r.id === roleId);
}

// Получить количество ролей в гильдии
export function getRoleCount(guildId) {
    const roles = getGuildRoles(guildId);
    return roles.length;
}

// Получить стиль кнопки из цвета роли
export function getButtonStyleFromColor(color) {
    if (!color) return ButtonStyle.Primary;
    
    const hex = color.toString(16).padStart(6, '0');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    if (r > 200 && g < 100 && b < 100) return ButtonStyle.Danger;
    if (r < 100 && g > 200 && b < 100) return ButtonStyle.Success;
    if (r > 200 && g > 200 && b < 100) return ButtonStyle.Warning;
    return ButtonStyle.Primary;
}

// Получить эмодзи роли
export function getRoleEmoji(guildId, roleId) {
    const role = getRoleById(guildId, roleId);
    return role ? role.emoji : '🎭';
}

// Получить описание роли
export function getRoleDescription(guildId, roleId) {
    const role = getRoleById(guildId, roleId);
    return role ? role.description : '';
}

// Получить все роли пользователя в системе
export function getUserSystemRoles(guildId, member) {
    const allRoles = getGuildRoles(guildId);
    return member.roles.cache.filter(r => 
        allRoles.some(ar => ar.id === r.id)
    );
}

// Проверить, есть ли у пользователя роль из системы
export function hasUserSystemRole(guildId, member, roleId) {
    const systemRoles = getGuildRoles(guildId);
    if (!systemRoles.some(r => r.id === roleId)) return false;
    return member.roles.cache.has(roleId);
}

// Очистить все роли гильдии
export function clearGuildRoles(guildId) {
    roleStore.set(guildId, []);
    return true;
}

// --- ОБРАБОТЧИК КНОПОК РОЛЕЙ (С ОТВЕТАМИ) ---
export async function handleRoleButton(interaction) {
    // Проверяем, что это кнопка роли
    if (!interaction.customId.startsWith('role_')) return;

    // ОТВЕТ НА КНОПКУ (deferReply)
    await interaction.deferReply({ ephemeral: true });

    const roleId = interaction.customId.replace('role_', '');
    const member = interaction.member;
    const role = interaction.guild.roles.cache.get(roleId);

    // Проверка: существует ли роль
    if (!role) {
        return interaction.editReply({
            content: '❌ Роль не найдена! Возможно, она была удалена.',
            ephemeral: true
        });
    }

    // Проверка: есть ли роль в системе
    if (!isRoleInStore(interaction.guildId, roleId)) {
        return interaction.editReply({
            content: '❌ Эта роль не доступна для выдачи через систему!',
            ephemeral: true
        });
    }

    // Проверка: может ли бот управлять ролью
    const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
    const botHighestRole = botMember.roles.highest;
    
    if (botHighestRole.position <= role.position) {
        return interaction.editReply({
            content: `❌ Бот не может управлять ролью **${role.name}**! Убедитесь, что роль бота находится выше этой роли.`,
            ephemeral: true
        });
    }

    const hasRole = member.roles.cache.has(roleId);

    try {
        if (hasRole) {
            // --- УДАЛЯЕМ РОЛЬ ---
            await member.roles.remove(role);
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ Роль удалена')
                .setDescription(`Роль **${role.name}** была удалена у вас`)
                .addFields(
                    { name: '👤 Пользователь', value: `${member.user.tag}`, inline: true },
                    { name: '🎭 Роль', value: `${role.name}`, inline: true }
                )
                .setFooter({ text: 'Организации 01 | King Mobile' })
                .setTimestamp();

            // ОТВЕТ НА КНОПКУ
            await interaction.editReply({ 
                embeds: [embed], 
                ephemeral: true 
            });

        } else {
            // --- ВЫДАЁМ РОЛЬ ---
            await member.roles.add(role);
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Роль выдана')
                .setDescription(`Вы получили роль **${role.name}**`)
                .addFields(
                    { name: '👤 Пользователь', value: `${member.user.tag}`, inline: true },
                    { name: '🎭 Роль', value: `${role.name}`, inline: true }
                )
                .setFooter({ text: 'Организации 01 | King Mobile' })
                .setTimestamp();

            // ОТВЕТ НА КНОПКУ
            await interaction.editReply({ 
                embeds: [embed], 
                ephemeral: true 
            });
        }
    } catch (error) {
        console.error('Ошибка управления ролью:', error);
        await interaction.editReply({
            content: '❌ Ошибка при изменении роли. Проверьте права бота.',
            ephemeral: true
        });
    }
}

// --- ОБРАБОТЧИК МЕНЮ РОЛЕЙ (С ОТВЕТАМИ) ---
export async function handleRoleMenu(interaction) {
    if (interaction.customId !== 'role_menu') return;

    // ОТВЕТ НА МЕНЮ (deferReply)
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const selectedRoles = interaction.values;
    const guildId = interaction.guildId;

    // Получаем все доступные роли из хранилища
    const availableRoles = getGuildRoles(guildId);
    const availableRoleIds = availableRoles.map(r => r.id);

    // Проверяем, что выбранные роли существуют в системе
    const validSelectedRoles = selectedRoles.filter(id => availableRoleIds.includes(id));
    
    if (validSelectedRoles.length === 0 && selectedRoles.length > 0) {
        return interaction.editReply({
            content: '❌ Выбранные роли не найдены в системе!',
            ephemeral: true
        });
    }

    // Определяем роли для удаления (те, что есть, но не выбраны)
    const rolesToRemove = member.roles.cache.filter(r => 
        availableRoleIds.includes(r.id) && !validSelectedRoles.includes(r.id)
    );

    // Определяем роли для добавления (те, что выбраны, но ещё не выданы)
    const rolesToAdd = validSelectedRoles.filter(id => 
        !member.roles.cache.has(id)
    );

    try {
        // Удаляем роли
        if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove);
        }
        
        // Добавляем роли
        if (rolesToAdd.length > 0) {
            const addRoles = rolesToAdd
                .map(id => interaction.guild.roles.cache.get(id))
                .filter(r => r);
            
            if (addRoles.length > 0) {
                await member.roles.add(addRoles);
            }
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

        // ОТВЕТ НА МЕНЮ
        await interaction.editReply({ embeds: [embed], ephemeral: true });

    } catch (error) {
        console.error('Ошибка управления ролями:', error);
        await interaction.editReply({
            content: '❌ Ошибка при изменении ролей. Проверьте права бота.',
            ephemeral: true
        });
    }
}
