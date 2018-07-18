// Description:
//   Birthday bot.
//
// Dependencies:
//   None
//
// Configuration:
//   None
//
// Commands:
//   birthdays list - shows a list of users and their birthdays
//   birthday set <username> <date>/<month>/<year> - sets a birthday for the user
//   birthdays on <date>/<month>/<year> - shows a list of users with a set birthday date
//   birthday delete <username> - deletes birthday for the user
//
// Author:
//   6r1d
(function () {
    const schedule = require('node-schedule');
    const moment = require('moment');
    const nFetch = require('node-fetch');

    const TENOR_API_KEY = process.env.TENOR_API_KEY || false;
    const TENOR_IMG_LIMIT = process.env.TENOR_IMG_LIMIT || false;
    const TENOR_SEARCH_TERM = process.env.TENOR_SEARCH_TERM || false;
    const BIRTHDAY_CRON_STRING = process.env.BIRTHDAY_CRON_STRING || false;
    const ANNOUNCER_CRON_STRING = process.env.ANNOUNCER_CRON_STRING || false;
    // Time and measure of it to announce birthdays in advance. For example, 7 days.
    const BIRTHDAY_ANNOUNCEMENT_BEFORE_CNT = process.env.BIRTHDAY_ANNOUNCEMENT_BEFORE_CNT || false;
    const BIRTHDAY_ANNOUNCEMENT_BEFORE_MODE = process.env.BIRTHDAY_ANNOUNCEMENT_BEFORE_MODE || false;

    const MSG_UNABLE_TO_LOCATE_USERS = `Не могу найти пользователей с этим днём рождения.`;
    const MSG_BIRTHDAYS_UNKNOWN = `Пока я ещё ничего не знаю про дни рождения!`;
    const MSG_BIRTHDAY_IN_A_WEEK = `Скоро день рождения у `;
    const DATE_FORMAT = "DD/MM/YYYY";

    const QUOTES = [
        "Hoping that your day will be as special as you are.",
        "Count your life by smiles, not tears. Count your age by friends, not years.",
        "May the years continue to be good to you. Happy Birthday!",
        "You're not getting older, you're getting better.",
        "May this year bring with it all the success and fulfillment your heart desires.",
        "Wishing you all the great things in life, hope this day will bring you an extra share of all that makes you happiest.",
        "Happy Birthday, and may all the wishes and dreams you dream today turn to reality.",
        "May this day bring to you all things that make you smile. Happy Birthday!",
        "Your best years are still ahead of you.",
        "Birthdays are filled with yesterday's memories, today's joys, and tomorrow's dreams.",
        "Hoping that your day will be as special as you are.", "You'll always be forever young.",
        "Happy Birthday, you're not getting older, you're just a little closer to death.",
        "Birthdays are good for you. Statistics show that people who have the most live the longest!",
        "I'm so glad you were born, because you brighten my life and fill it with joy.",
        "Always remember: growing old is mandatory, growing up is optional.",
        "Better to be over the hill than burried under it.",
        "You always have such fun birthdays, you should have one every year.",
        "Happy birthday to you, a person who is smart, good looking, and funny and reminds me a lot of myself.",
        "We know we're getting old when the only thing we want for our birthday is not to be reminded of it.",
        "Happy Birthday on your very special day, I hope that you don't die before you eat your cake."
    ];

    /**
     * Select random image URL from a list of images (returned by the search).
     *
     * @param {Object} response - Response object from node-fetch package.
     * @returns {string} image URL
     */
    function selectTenorImageUrl(response) {
        let animals = response.results;
        let randomAnimals = animals[Math.floor(Math.random() * animals.length)];
        return randomAnimals.media[0].gif.url;
    }

    /**
     * Get image URL through Tenor API.
     * It also uses TENOR_API_KEY, TENOR_SEARCH_TERM, TENOR_IMG_LIMIT as request params.
     *
     * @returns {Promise<string|*>} image URL
     */
    async function grabTenorImage() {
        let imageUrl, anonId, response, tenorResponse;
        let tenor_key_url = "https://api.tenor.com/v1/anonid?key=" + TENOR_API_KEY;

        response = await nFetch(tenor_key_url);
        tenorResponse = await response.json();
        // TODO process output for the wrong key, invalid input and so on
        anonId = tenorResponse.anon_id;

        let searchUrl = "https://api.tenor.com/v1/search?tag=${TENOR_SEARCH_TERM}&key=${TENOR_API_KEY}&limit=${TENOR_IMG_LIMIT}&anon_id=${anonId}";
        // TODO process invalid inputs:
        // check if response might be parsed as JSON,
        // check if input dict contains required keys
        response = await nFetch(searchUrl);
        imageUrl = selectTenorImageUrl(await response.json());

        return imageUrl;
    }

    /**
     * Check if two dates have the same month and day values.
     *
     * @param {moment} firstDate
     * @param {moment} secondsDate
     * @returns {boolean}
     */
    function isEqualMonthDay(firstDate, secondsDate) {
        return (firstDate.month() === secondsDate.month()) &&
            (firstDate.date() === secondsDate.date());
    }

    /**
     * Check if date string is a valid date
     * using strict format which are defined in `DATE_FORMAT` constant.
     *
     * @param {string} date
     * @returns {boolean}
     */
    function isValidDate(date) {
        return typeof date === "string" && moment(date, DATE_FORMAT, true).isValid();
    }

    /**
     * Find users who have the same value in their birthday field with date.
     *
     * @param {Date} date - Date which will be used for comparing.
     * @param {Object} users - User object where each key is user instance.
     * @returns {Array}
     */
    function findUsersBornOnDate(date, users) {
        let matches = [];
        for (let user of Object.values(users)) {
            if (isValidDate(user.date_of_birth)) {
                if (isEqualMonthDay(date, moment(user.date_of_birth, DATE_FORMAT))) {
                    matches.push(user);
                }
            }
        }
        return matches;
    }

    /**
     * Birthday announce for users into GENERAL channel.
     *
     * @param {Object} robot - Robot from root function's param.
     * @param {Array} users - User list.
     * @param {string} imageUrl - Image url for posting into channel.
     */
    function generalBirthdayAnnouncement(robot, users, imageUrl) {
        let messageText, userNames = users.map(user => `@${user.name}`);
        if (users.length > 0) {
            messageText = `${imageUrl || ''}\nСегодня день рождения ${userNames.join(', ')}!\n${quote()}`;
            robot.messageRoom("general", messageText);
        }
    }

    /**
     * Get random quote from the QUOTES array.
     *
     * @returns {string}
     */
    function quote() {
        return QUOTES[(Math.random() * QUOTES.length) >> 0];
    }

    module.exports = function (robot) {
        let set_regex = /(birthday set) (?:@?([\w\d .\-_]+)\?*) ((0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[0-2])\/([\d]{4}))\b/i;
        let check_regex = /(birthdays on) ((0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[0-2])\/([\d]{4}))\b/i;
        let delete_regex = /(birthday delete) (?:@?([\w\d .\-_]+)\?*)\b/i;


        robot.hear(set_regex, function (msg) {
            let date, name, user, users;
            name = msg.match[2];
            date = msg.match[3];
            users = robot.brain.usersForFuzzyName(name);
            if (users.length === 1) {
                user = users[0];
                user.date_of_birth = date;
                return msg.send(`Сохраняю день рождения ${name}: ${user.date_of_birth}`);
            } else if (users.length > 1) {
                return msg.send(getAmbiguousUserText(users));
            } else {
                return msg.send(`${name}? Кто это?`);
            }
        });

        // Check a birthday using a date
        robot.hear(check_regex, function (msg) {
            let date = msg.match[2], users;
            users = findUsersBornOnDate(moment(date, DATE_FORMAT), robot.brain.data.users);
            if (users.length === 0) {
                return msg.send(MSG_UNABLE_TO_LOCATE_USERS);
            }
            let userNames = users.map(user => `@${user.name}`), message;
            message = `*${date}* день рождения у ${userNames.join(', ')}\n${quote()}`;
            return msg.send(message);
        });

        // Delete someone's birthday
        robot.hear(delete_regex, function (msg) {
            let name = msg.match[2], user, users;
            users = robot.brain.usersForFuzzyName(name);
            if (users.length === 1) {
                user = users[0];
                user.date_of_birth = null;
                return msg.send(`Удаляю день рождения ${name}`);
            } else if (users.length > 1) {
                return msg.send(getAmbiguousUserText(users));
            } else {
                return msg.send(`${name}? Кто это?`);
            }
        });

        // Display users' birthdays
        robot.respond(/birthdays list/i, function (msg) {
            let message, messageItems;
            messageItems = Object.values(robot.brain.data.users)
                .filter(user => isValidDate(user.date_of_birth))
                .map(user => `${user.name} родился ${user.date_of_birth}`);
            message = messageItems.length === 0 ? 'Oops... No results.' : messageItems.join('\n');
            return msg.send(message);
        });

        // Regularly checks for a birthday, announces to "generic" chat room
        if (BIRTHDAY_CRON_STRING) {
            schedule.scheduleJob(BIRTHDAY_CRON_STRING, function () {
                let birthday_users, i, idx, len, msg, user;
                birthday_users = findUsersBornOnDate(moment(), robot.brain.data.users);
                let birthday_announcement = function (image_url) {
                    generalBirthdayAnnouncement(robot, birthday_users, image_url);
                };
                // Use Tenor images if possible, ignore images otherwise
                if (TENOR_API_KEY && TENOR_IMG_LIMIT && TENOR_SEARCH_TERM) {
                    grabTenorImage().then(birthday_announcement).catch(
                        function (err) {
                            console.error(err);
                        });
                } else {
                    birthday_announcement(birthday_users);
                }
            });
        }

        // Announce birthdays to each user (except one whose birthday it is) in advance
        if (ANNOUNCER_CRON_STRING) {
            schedule.scheduleJob(ANNOUNCER_CRON_STRING, function () {
                // TODO ask if it could be written in one line
                let after_an_interval, birthday_users, birthday_user,
                    bday_usr_id;
                after_an_interval = moment();
                after_an_interval.add(parseInt(BIRTHDAY_ANNOUNCEMENT_BEFORE_CNT, 10), BIRTHDAY_ANNOUNCEMENT_BEFORE_MODE);
                birthday_users = findUsersBornOnDate(after_an_interval, robot.brain.data.users);
                for (bday_usr_id = 0; bday_usr_id < birthday_users.length; bday_usr_id++) {
                    birthday_user = birthday_users[bday_usr_id];
                    let users = robot.brain.data.users;
                    let msg_text = MSG_BIRTHDAY_IN_A_WEEK + `<@${birthday_user.name}>: ` +
                        `${after_an_interval.date()}-${after_an_interval.month()}-${after_an_interval.year()}.`;
                    for (let user_key in users || {}) {
                        let user = users[user_key];
                        if (birthday_user.name !== user.name) {
                            robot.adapter.sendDirect({user: {name: user.name}}, msg_text);
                        }
                    }
                }
            });
        }
    }
}).call(this);
