import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('день_рождения')
        .setDescription('Команды системы дней рождения')
        .addSubcommand(subcommand =>
            subcommand
                .setName('установить')
                .setDescription('Установить вашу дату рождения')
                .addIntegerOption(option =>
                    option
                        .setName('месяц')
                        .setDescription('Месяц рождения (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('день')
                        .setDescription('День рождения (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('информация')
                .setDescription('Просмотр информации о дне рождения')
                .addUserOption(option =>
                    option
                        .setName('пользователь')
                        .setDescription('Пользователь, чей день рождения проверить')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('список')
                .setDescription('Показать все дни рождения на сервере')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('удалить')
                .setDescription('Удалить вашу дату рождения')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ближайшие')
                .setDescription('Показать ближайшие дни рождения')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('канал')
                .setDescription('Установить или отключить канал для объявлений о днях рождения. (Требуется Управление сервером)')
                .addChannelOption(option =>
                    option
                        .setName('канал')
                        .setDescription('Текстовый канал для объявлений. Оставьте пустым, чтобы отключить.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'установить':
                return await birthdaySet.execute(interaction, config, client);
            case 'информация':
                return await birthdayInfo.execute(interaction, config, client);
            case 'список':
                return await birthdayList.execute(interaction, config, client);
            case 'удалить':
                return await birthdayRemove.execute(interaction, config, client);
            case 'ближайшие':
                return await nextBirthdays.execute(interaction, config, client);
            case 'канал':
                return await birthdaySetchannel.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Неизвестная подкоманда' });
        }
    }
};
