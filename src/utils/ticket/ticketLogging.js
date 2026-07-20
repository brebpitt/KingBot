// ticketLogging.js

import { ChannelType } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { logger } from '../logger.js';
import {
  buildStandardLogEmbed,
  formatRatingStars,
  resolveUserAuthor,
} from '../logging/logEmbeds.js';

// Логирование событий тикета
export async function logTicketEvent({ client, guildId, event }) {
  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      logger.warn(`logTicketEvent вызван без действительной гильдии: ${guildId}`);
      return;
    }

    const config = await getGuildConfig(client, guildId);

    const logChannelId = getLogChannelForEventType(config, event.type);
    if (!logChannelId) {
      return;
    }

    const channel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel) {
      logger.warn(`Канал логов тикетов не найден: ${logChannelId} для типа события: ${event.type}`);
      return;
    }

    const permissions = channel.permissionsFor(guild.members.me);
    if (!permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`Отсутствуют разрешения в канале логов тикетов: ${logChannelId}`);
      return;
    }

    const embed = await createTicketLogEmbed(guild, event);

    const messageOptions = { embeds: [embed] };

    if (event.attachments && event.attachments.length > 0) {
      messageOptions.files = event.attachments;
    }

    await channel.send(messageOptions);
    logger.info(`Событие тикета залогировано: ${event.type} в гильдии ${guildId}`);
  } catch (error) {
    logger.error('Ошибка логирования события тикета:', error);
  }
}

// Логирование отзыва о тикете
export async function logTicketFeedback({
  client,
  guildId,
  ticketNumber,
  ticketChannelId,
  userId,
  rating = null,
  comment = null,
}) {
  await logTicketEvent({
    client,
    guildId,
    event: {
      type: 'feedback',
      ticketId: ticketChannelId,
      ticketNumber,
      userId,
      metadata: {
        rating,
        comment,
      },
    },
  });
}

// Получение ID канала для логирования в зависимости от типа события
function getLogChannelForEventType(config, eventType) {
  switch (eventType) {
    case 'transcript':
      return config.ticketTranscriptChannelId || null;

    case 'open':
    case 'close':
    case 'delete':
    case 'claim':
    case 'unclaim':
    case 'priority':
    case 'pin':
    case 'unpin':
    case 'feedback':
      return config.ticketLogsChannelId || null;

    default:
      return null;
  }
}

// Стили оформления для разных типов событий тикета
const TICKET_EVENT_STYLES = {
  open: { color: 0x5865F2, title: 'Тикет создан' },
  close: { color: 0xED4245, title: 'Тикет закрыт' },
  delete: { color: 0x8b0000, title: 'Тикет удален' },
  claim: { color: 0x5865F2, title: 'Тикет назначен' },
  unclaim: { color: 0xFAA61A, title: 'Назначение снято' },
  priority: { color: 0x9b59b6, title: 'Приоритет обновлен' },
  transcript: { color: 0x57F287, title: 'Транскрипт создан' },
  feedback: { color: 0x57F287, title: 'Отзыв получен' },
};

// Создание embed-сообщения для лога события тикета
async function createTicketLogEmbed(guild, event) {
  const style = TICKET_EVENT_STYLES[event.type] || { color: 0x95a5a6, title: 'Событие тикета' };
  const ticketNumber = event.ticketNumber || event.ticketId;
  const ticketRef = ticketNumber ? `#${ticketNumber}` : 'Неизвестно';
  const channelMention = event.ticketId ? `<#${event.ticketId}>` : null;
  const executorMention = event.executorId ? `<@${event.executorId}>` : null;
  const userMention = event.userId ? `<@${event.userId}>` : null;

  let inlineFields = [];
  let fields = [];
  let author = null;
  let footer = { text: 'TitanBot Тикеты' };

  switch (event.type) {
    case 'open':
      author = await resolveUserAuthor(guild.client, event.userId);
      inlineFields = [
        { name: 'Тикет', value: ticketRef, inline: true },
        { name: 'Создатель', value: userMention || 'Неизвестно', inline: true },
      ];
      if (channelMention) {
        inlineFields.push({ name: 'Канал', value: channelMention, inline: true });
      }
      if (event.reason) {
        fields.push({ name: 'Причина', value: String(event.reason).slice(0, 1024), inline: false });
      }
      break;

    case 'close':
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Тикет', value: ticketRef, inline: true },
        { name: 'Закрыл', value: executorMention || 'Неизвестно', inline: true },
      ];
      if (channelMention) {
        inlineFields.push({ name: 'Канал', value: channelMention, inline: true });
      }
      if (event.reason) {
        fields.push({ name: 'Причина', value: String(event.reason).slice(0, 1024), inline: false });
      }
      break;

    case 'delete':
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Тикет', value: ticketRef, inline: true },
        { name: 'Удалил', value: executorMention || 'Неизвестно', inline: true },
      ];
      break;

    case 'claim':
    case 'unclaim':
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Тикет', value: ticketRef, inline: true },
        {
          name: event.type === 'claim' ? 'Назначил' : 'Снял назначение',
          value: executorMention || 'Неизвестно',
          inline: true,
        },
      ];
      break;

    case 'priority': {
      const priorityEmojis = { none: '⚪', low: '🔵', medium: '🟢', high: '🟡', urgent: '🔴' };
      const priorityLabel = event.priority
        ? `${priorityEmojis[event.priority] || '⚪'} ${event.priority.charAt(0).toUpperCase()}${event.priority.slice(1)}`
        : 'Неизвестно';
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Тикет', value: ticketRef, inline: true },
        { name: 'Приоритет', value: priorityLabel, inline: true },
        { name: 'Обновил', value: executorMention || 'Неизвестно', inline: true },
      ];
      break;
    }

    case 'transcript':
      inlineFields = [
        { name: 'Тикет', value: ticketRef, inline: true },
        { name: 'Создатель', value: userMention || 'Неизвестно', inline: true },
      ];
      if (event.metadata?.messageCount) {
        inlineFields.push({ name: 'Сообщений', value: String(event.metadata.messageCount), inline: true });
      }
      if (event.metadata?.duration) {
        fields.push({ name: 'Длительность', value: String(event.metadata.duration), inline: false });
      }
      if (event.metadata?.subject || event.reason) {
        fields.push({
          name: 'Тема',
          value: String(event.metadata?.subject || event.reason).slice(0, 1024),
          inline: false,
        });
      }
      break;

    case 'feedback': {
      const rating = event.metadata?.rating ?? event.rating;
      const comment = event.metadata?.comment;
      const ratingDisplay = formatRatingStars(rating) || 'Нет оценки';

      author = await resolveUserAuthor(guild.client, event.userId);
      inlineFields = [
        { name: 'Тикет', value: ticketRef, inline: true },
        { name: 'Оценка', value: ratingDisplay, inline: true },
      ];

      if (comment) {
        fields.push({
          name: 'Комментарий',
          value: String(comment).slice(0, 1024),
          inline: false,
        });
      }
      break;
    }

    default:
      inlineFields = [
        { name: 'Тикет', value: ticketRef, inline: true },
      ];
      if (event.reason) {
        fields.push({ name: 'Детали', value: String(event.reason).slice(0, 1024), inline: false });
      }
  }

  const titlePrefix = event.type === 'feedback' ? '⭐ ' : '';
  return buildStandardLogEmbed({
    color: style.color,
    title: `${titlePrefix}${style.title}`,
    inlineFields,
    fields,
    author,
    footer,
  });
}

// Получение конфигурации логирования тикетов
export async function getTicketLoggingConfig(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  return {
    enabled: !!(config.ticketLogsChannelId || config.ticketTranscriptChannelId),
    lifecycleChannelId: config.ticketLogsChannelId || null,
    transcriptChannelId: config.ticketTranscriptChannelId || null,
  };
}

// Проверка валидности канала для логирования
export function validateLogChannel(channel, botMember) {
  if (!channel || channel.type !== ChannelType.GuildText) {
    return {
      valid: false,
      error: 'Канал должен быть текстовым каналом.',
    };
  }

  const permissions = channel.permissionsFor(botMember);
  const requiredPermissions = ['SendMessages', 'EmbedLinks'];

  const missing = requiredPermissions.filter((perm) => !permissions.has(perm));

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Отсутствуют разрешения: ${missing.join(', ')}`,
    };
  }

  return { valid: true };
  }
