import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../utils/embeds.js';
import { createTicket, closeTicket, claimTicket, updateTicketPriority } from '../services/ticket.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { replyUserError, ErrorTypes, handleInteractionError, createError } from '../utils/errorHandler.js';
import { getTicketPermissionContext } from '../utils/ticket/ticketPermissions.js';

// Экранирование HTML-символов для безопасного вывода
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Проверка, что взаимодействие происходит в гильдии (сервере)
async function ensureGuildContext(interaction) {
  if (interaction.inGuild()) {
    return true;
  }

  if (!interaction.replied && !interaction.deferred) {
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Это действие может быть использовано только на сервере.' });
  }

  return false;
}

// Проверка прав на управление тикетом с таймаутом
async function assertTicketPermission(interaction, client, actionLabel, options = {}, timeoutMs = 2500) {
  const { allowTicketCreator = false } = options;

  let context;
  try {
    const contextPromise = getTicketPermissionContext({ client, interaction });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );
    context = await Promise.race([contextPromise, timeoutPromise]);
  } catch (error) {
    if (error.message === 'Timeout') {
      throw createError(
        'Таймаут проверки прав тикета',
        ErrorTypes.RATE_LIMIT,
        'Проверка прав заняла слишком много времени. Пожалуйста, попробуйте снова.'
      );
    }
    throw createError(
      'Ошибка проверки прав тикета',
      ErrorTypes.UNKNOWN,
      `Не удалось проверить права: ${error.message}`
    );
  }

  if (!context.ticketData) {
    throw createError(
      'Не канал тикета',
      ErrorTypes.VALIDATION,
      'Это действие может быть использовано только в канале тикета.'
    );
  }

  const allowed = allowTicketCreator ? context.canCloseTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'Вы должны иметь права **Управление каналами**, роль **Персонала тикетов** или быть **создателем тикета**.'
      : 'Вы должны иметь права **Управление каналами** или роль **Персонала тикетов**.';
    throw createError(
      'Отказано в доступе к тикету',
      ErrorTypes.PERMISSION,
      `${permissionMessage}\n\nВы не можете ${actionLabel}.`
    );
  }

  return context;
}

// Проверка прав на управление тикетом (без таймаута)
async function ensureTicketPermission(interaction, client, actionLabel, options = {}) {
  const { allowTicketCreator = false } = options;

  const context = await getTicketPermissionContext({ client, interaction });

  if (!context.ticketData) {
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Это действие может быть использовано только в канале тикета.' });
    return null;
  }

  const allowed = allowTicketCreator ? context.canCloseTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'Вы должны иметь права **Управление каналами**, роль **Персонала тикетов** или быть **создателем тикета**.'
      : 'Вы должны иметь права **Управление каналами** или роль **Персонала тикетов**.';

    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `${permissionMessage}\n\nВы не можете ${actionLabel}.` });
    return null;
  }

  return context;
}

// Обработчик создания тикета (кнопка)
const createTicketHandler = {
  name: 'create_ticket',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      // Проверка ограничения скорости создания тикетов
      const rateLimitKey = `${interaction.user.id}:create_ticket`;
      const allowed = await checkRateLimit(rateLimitKey, 3, 60000);
      if (!allowed) {
        await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Вы слишком часто создаете тикеты. Подождите минуту и попробуйте снова.' });
        return;
      }

      const config = await getGuildConfig(client, interaction.guildId);
      const maxTicketsPerUser = config.maxTicketsPerUser || 3;
      
      // Проверка количества открытых тикетов у пользователя
      const { getUserTicketCount } = await import('../services/ticket.js');
      const currentTicketCount = await getUserTicketCount(interaction.guildId, interaction.user.id);
      
      if (currentTicketCount >= maxTicketsPerUser) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Вы достигли максимального количества открытых тикетов (${maxTicketsPerUser}).\n\nПожалуйста, закройте существующие тикеты перед созданием нового.\n\n**Текущие тикеты:** ${currentTicketCount}/${maxTicketsPerUser}` });
      }
      
      // Создание модального окна для ввода причины создания тикета
      const modal = new ModalBuilder()
        .setCustomId('create_ticket_modal')
        .setTitle('Создать тикет');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Почему вы создаете этот тикет?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Опишите вашу проблему...')
        .setRequired(true)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Ошибка создания модального окна тикета:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Не удалось открыть форму создания тикета.' });
      }
    }
  }
};

// Обработчик модального окна создания тикета
const createTicketModalHandler = {
  name: 'create_ticket_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const reason = interaction.fields.getTextInputValue('reason');
      const config = await getGuildConfig(client, interaction.guildId);
      const categoryId = config.ticketCategoryId || null;
      
      // Создание тикета
      const { channel } = await createTicket(
        interaction.guild,
        interaction.member,
        categoryId,
        reason
      );
      await interaction.editReply({
        embeds: [successEmbed(
          'Тикет создан',
          `Ваш тикет создан в ${channel}!`
        )]
      });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'button', handler: 'ticket', customId: interaction.customId });
    }
  }
};

// Обработчик закрытия тикета (кнопка)
const closeTicketHandler = {
  name: 'ticket_close',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'закрыть этот тикет', { allowTicketCreator: true }, 2000);

      // Модальное окно для указания причины закрытия
      const modal = new ModalBuilder()
        .setCustomId('ticket_close_modal')
        .setTitle('Закрыть тикет');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Причина закрытия (необязательно)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Укажите причину закрытия тикета...')
        .setRequired(false)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Ошибка закрытия тикета:', error);

      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Не удалось открыть форму закрытия тикета.' });
      }
    }
  }
};

// Обработчик модального окна закрытия тикета
const closeTicketModalHandler = {
  name: 'ticket_close_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'закрыть этот тикет', { allowTicketCreator: true }, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const providedReason = interaction.fields.getTextInputValue('reason')?.trim();
      const reason = providedReason || 'Закрыто через кнопку тикета без указания причины.';

      await closeTicket(interaction.channel, interaction.user, reason);
      await interaction.editReply({ embeds: [successEmbed('Тикет закрыт', 'Этот тикет был закрыт.')] });
    } catch (error) {
      logger.error('Ошибка отправки модального окна закрытия тикета:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при закрытии тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при закрытии тикета.' });
      }
    }
  }
};

// Обработчик назначения тикета на себя
const claimTicketHandler = {
  name: 'ticket_claim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'назначать тикеты', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      await claimTicket(interaction.channel, interaction.user);
      await interaction.editReply({ embeds: [successEmbed('Тикет назначен', 'Вы назначили этот тикет на себя.')] });
    } catch (error) {
      logger.error('Ошибка назначения тикета:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при назначении тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при назначении тикета.' });
      }
    }
  }
};

// Обработчик изменения приоритета тикета
const priorityTicketHandler = {
  name: 'ticket_priority',
  async execute(interaction, client, args) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'изменить приоритет тикета', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const priority = args?.[0];
      if (!priority) {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Требуется значение приоритета.' });
        return;
      }

      await updateTicketPriority(interaction.channel, priority, interaction.user);
      await interaction.editReply({ embeds: [successEmbed('Приоритет обновлен', `Приоритет тикета установлен на **${priority.toUpperCase()}**.`)] });
    } catch (error) {
      logger.error('Ошибка обновления приоритета тикета:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при обновлении приоритета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при обновлении приоритета.' });
      }
    }
  }
};

// Обработчик закрепления/открепления тикета
const pinTicketHandler = {
  name: 'ticket_pin',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'закреплять тикеты', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const channel = interaction.channel;
      const category = channel.parent;

      if (!category) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Этот тикет не находится в категории.' });
        return;
      }

      const hasPingEmoji = channel.name.startsWith('📌');
      
      if (hasPingEmoji) {
        // Открепление - удаляем эмодзи и перемещаем в конец
        const newName = channel.name.replace(/^📌\s*/, '');
        await channel.edit({
          name: newName,
          position: 999 
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Тикет откреплен',
            description: 'Этот тикет был откреплен и перемещен в обычную позицию.',
            color: 0x95A5A6
          })],
          flags: MessageFlags.Ephemeral
        });

        logger.info('Тикет откреплен', {
          guildId: interaction.guildId,
          channelId: channel.id,
          channelName: newName,
          userId: interaction.user.id
        });
      } else {
        // Закрепление - добавляем эмодзи и перемещаем в начало
        const pinnedName = `📌 ${channel.name}`;
        await channel.edit({
          name: pinnedName,
          position: 0 
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Тикет закреплен',
            description: 'Этот тикет был закреплен в верхней части категории.',
            color: 0x3498db
          })],
          flags: MessageFlags.Ephemeral
        });

        logger.info('Тикет закреплен', {
          guildId: interaction.guildId,
          channelId: channel.id,
          channelName: pinnedName,
          userId: interaction.user.id
        });
      }

      // Логирование события закрепления/открепления
      await logTicketEvent({
        client: interaction.client,
        guildId: interaction.guildId,
        event: {
          type: hasPingEmoji ? 'unpin' : 'pin',
          ticketId: channel.id,
          ticketNumber: channel.name.replace(/[^0-9]/g, ''),
          userId: interaction.user.id,
          executorId: interaction.user.id,
          metadata: {
            isPinned: !hasPingEmoji,
            newChannelName: hasPingEmoji ? channel.name.replace(/^📌\s*/, '') : `📌 ${channel.name}`
          }
        }
      });

    } catch (error) {
      logger.error('Ошибка закрепления/открепления тикета:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Не удалось закрепить/открепить тикет.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Не удалось закрепить/открепить тикет.' });
      }
    }
  }
};

// Обработчик снятия назначения с тикета
const unclaimTicketHandler = {
  name: 'ticket_unclaim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'снимать назначение с тикетов', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { unclaimTicket } = await import('../services/ticket.js');
      await unclaimTicket(interaction.channel, interaction.member);
      await interaction.editReply({ embeds: [successEmbed('Назначение снято', 'Назначение с этого тикета снято.')] });
    } catch (error) {
      logger.error('Ошибка снятия назначения с тикета:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при снятии назначения с тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при снятии назначения с тикета.' });
      }
    }
  }
};

// Обработчик повторного открытия тикета
const reopenTicketHandler = {
  name: 'ticket_reopen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'повторно открывать тикеты', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { reopenTicket } = await import('../services/ticket.js');
      const { movedToOpenCategory, openCategoryMoveFailed } = await reopenTicket(interaction.channel, interaction.member);
      let reopenMessage = 'Этот тикет был повторно открыт.';
      if (openCategoryMoveFailed) {
        reopenMessage += ' Примечание: Не удалось переместить канал обратно в категорию открытых тикетов.';
      }
      await interaction.editReply({ embeds: [successEmbed('Тикет повторно открыт', reopenMessage)] });
    } catch (error) {
      logger.error('Ошибка повторного открытия тикета:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при повторном открытии тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при повторном открытии тикета.' });
      }
    }
  }
};

// Обработчик удаления тикета
const deleteTicketHandler = {
  name: 'ticket_delete',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'удалять тикеты', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { deleteTicket } = await import('../services/ticket.js');
      await deleteTicket(interaction.channel, interaction.member);
      await interaction.editReply({ embeds: [successEmbed('Тикет удален', 'Этот тикет будет удален в ближайшее время.')] });
    } catch (error) {
      logger.error('Ошибка удаления тикета:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при удалении тикета.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Произошла ошибка при удалении тикета.' });
      }
    }
  }
};

export default createTicketHandler;
export { 
  createTicketModalHandler, 
  closeTicketModalHandler,
  closeTicketHandler, 
  claimTicketHandler, 
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler 
};
