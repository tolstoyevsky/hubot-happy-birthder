// Description:
//   Birthday bot.
//
// Dependencies:
//   "moment": "^2.22.2",
//   "node-fetch": "^2.1.2"
//   "node-schedule": "^0.6.0",
//
// Configuration:
//   None
//
// Commands:
//   birthdays list - shows a list of users and their birthdays
//   birthday set <username> <date>/<month>/<year> - sets a birthday for the user (privileged: admin, manager)
//   birthdays on <date>/<month>/<year> - shows a list of users with a set birthday date (privileged: admin, manager)
//   birthday delete <username> - deletes birthday for the user (privileged: admin, manager)
//
// Author:
//   6r1d
(function () {
    const schedule = require('node-schedule');
    const moment = require('moment');
    const nFetch = require('node-fetch');

    const TENOR_API_KEY = process.env.TENOR_API_KEY || false;
    const ADMIN_USERS = (process.env.HUBOT_AUTH_ADMIN || '').split(',');
    const TENOR_IMG_LIMIT = process.env.TENOR_IMG_LIMIT || false;
    const TENOR_SEARCH_TERM = process.env.TENOR_SEARCH_TERM || false;
    const BIRTHDAY_CRON_STRING = process.env.BIRTHDAY_CRON_STRING || false;
    const ANNOUNCER_CRON_STRING = process.env.ANNOUNCER_CRON_STRING || false;
    // Time and measure of it to announce birthdays in advance. For example, 7 days.
    const BIRTHDAY_ANNOUNCEMENT_BEFORE_CNT = process.env.BIRTHDAY_ANNOUNCEMENT_BEFORE_CNT || false;
    const BIRTHDAY_ANNOUNCEMENT_BEFORE_MODE = process.env.BIRTHDAY_ANNOUNCEMENT_BEFORE_MODE || false;

    const MSG_PERMISSION_DENIED = "Permission denied.";
    const DATE_FORMATS = ["DD.MM.YYYY", "D.M.YYYY", "DD/MM/YYYY", "D/M/YYYY", ];
    const SHORT_DATE_FORMAT = "DD/MM";

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

    const ROLES = {
        manager: 'manager',
        admin: 'admin'
    };

    /**
     * Select a random image URL from a list of images (returned by the search).
     *
     * @param {Object} response - Response object from the node-fetch package.
     * @returns {string} image URL
     */
    function selectTenorImageUrl(response) {
        let animals = response.results;
        let randomAnimals = animals[Math.floor(Math.random() * animals.length)];
        return randomAnimals.media[0].gif.url;
    }

    /**
     * Get an image URL through Tenor's GIF API.
     * TENOR_API_KEY, TENOR_SEARCH_TERM and TENOR_IMG_LIMIT are used as request params.
     *
     * @returns {Promise<string|*>} image URL
     */
    async function grabTenorImage() {
        let imageUrl, response;

        const tenorKeyUrl = `https://api.tenor.com/v1/anonid?key=${TENOR_API_KEY}`;

        const delay = (ms) => {
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve()
                }, ms)
            })
        }

        const retryFetch = (url, retries=60, retryDelay=1000) => {
            return new Promise((resolve, reject) => {
                const wrapper = n => {
                    nFetch(url)
                        .then(res => { resolve(res) })
                        .catch(async err => {
                            if(n > 0) {
                                console.log(`Retrying to request ${url}. ${n} attempts left.`)
                                await delay(retryDelay)
                                wrapper(--n)
                            } else {
                                reject(err)
                            }
                        })
                    }

                wrapper(retries)
            })
        }

        const requestTenor = async () =>
            await (await retryFetch(tenorKeyUrl)
                .then(res => res.json())
                .then(async (res) => {
                    const anonId = res.anon_id;
                    const searchUrl = `https://api.tenor.com/v1/search?tag=${TENOR_SEARCH_TERM}&key=${TENOR_API_KEY}&limit=${TENOR_IMG_LIMIT}&anon_id=${anonId}`;

                    response = await retryFetch(searchUrl);

                    return response;
                }));

        response = await requestTenor();
        imageUrl = selectTenorImageUrl(await response.json());

        return imageUrl;
    }

    /**
     * Check if two specified dates have the same month and day.
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
     * Check if the specified date string follows the format stored in the DATE_FORMATS constant.
     *
     * @param {string} date
     * @returns {boolean}
     */
    function isValidDate(date) {
        return typeof date === "string" && moment(date, DATE_FORMATS, true).isValid();
    }

    /**
     * Find the users who have the same birthday.
     *
     * @param {Date} date - Date which will be used for the comparison.
     * @param {Object} users - User object where each key is the user instance.
     * @returns {Array}
     */
    function findUsersBornOnDate(date, users) {
        let matches = [];
        for (let user of Object.values(users)) {
            if (isValidDate(user.date_of_birth)) {
                if (isEqualMonthDay(date, moment(user.date_of_birth, DATE_FORMATS))) {
                    matches.push(user);
                }
            }
        }
        return matches;
    }

    /**
     * Get a random quote from the QUOTES array.
     *
     * @returns {string}
     */
    function quote() {
        return QUOTES[(Math.random() * QUOTES.length) >> 0];
    }

    /**
     * Send reminders of the upcoming birthdays to the users (except ones whose birthday it is).
     *
     * @param {Object} robot - Robot from the param of the root function.
     */
    function sendReminders(robot) {
        let targetDay = moment(), userNames, userNamesString,
            users, message;
        targetDay.add(parseInt(BIRTHDAY_ANNOUNCEMENT_BEFORE_CNT, 10), BIRTHDAY_ANNOUNCEMENT_BEFORE_MODE);
        users = findUsersBornOnDate(targetDay, robot.brain.data.users);
        userNames = users.map(user => user.name);
        userNamesString = userNames.map(name => `@${name}`).join(', ');
        message = `${userNamesString} is having a birthday on ${targetDay.format(SHORT_DATE_FORMAT)}.`;
        if (users.length > 0) {
            for (let user of Object.values(robot.brain.data.users)) {
                if (userNames.indexOf(user.name) === -1) {
                    robot.adapter.sendDirect({user: {name: user.name}}, message);
                }
            }
        }
    }

    /**
     * Write birthday messages to the general channel.
     *
     * @param {Object} robot - Robot from the param of the root function.
     */
    function sendCongratulations(robot) {
        let users = findUsersBornOnDate(moment(), robot.brain.data.users);
        if (users.length > 0) {
            grabTenorImage()
                .then(function (imageUrl) {
                    let messageText,
                        userNames = users.map(user => `@${user.name}`);
                    messageText = `${imageUrl || ''}\nToday is birthday of ${userNames.join(' and ')}!\n${quote()}`;
                    robot.messageRoom("general", messageText);
                })
                .catch(e => console.error(e));
        }
    }


    /** Check permissions for the specified user.
     *
     * @param {Object} user - Target user.
     * @param {Array|undefined} roles - Array of the users roles.
     * @returns {boolean}
     */
    function hasRoles(user, roles) {
        return (ADMIN_USERS.indexOf(user.id.toString()) !== -1) || (!!user.roles && roles.filter(role => user.roles.indexOf(role) !==-1).length > 0);
    }

    module.exports = function (robot) {
        const regExpUsername = new RegExp(/(?:@?([\w\d .\-_]+)\?*)/),
            regExpDate = new RegExp(/((0?[1-9]|[12][0-9]|3[01])[\/.](0?[1-9]|1[0-2])[\/.]([\d]{4}))\b/);

        const routes = {
            set: new RegExp(/(birthday set)\s+/.source + regExpUsername.source + /\s+/.source + regExpDate.source, 'i'),
            delete: new RegExp(/(birthday delete)\s+/.source + regExpUsername.source + /\b/.source, 'i'),
            check: new RegExp(/(birthdays on)\s+/.source + regExpDate.source, 'i'),
            list: new RegExp(/birthdays list$/, 'i')
        };

        // Link together the specified birthday and user and store the link in the brain.
        robot.hear(routes.set, function (msg) {
            if (!hasRoles(msg.message.user, [ROLES.admin, ROLES.manager])) {
                msg.send(MSG_PERMISSION_DENIED);
                return;
            }
            let date, name, user, users;
            name = msg.match[2];
            date = msg.match[3];
            users = robot.brain.usersForFuzzyName(name);
            if (users.length === 1) {
                user = users[0];
                user.date_of_birth = date;
                return msg.send(`Saving ${name}'s birthday.`);
            } else if (users.length > 1) {
                return msg.send(getAmbiguousUserText(users));
            } else {
                return msg.send(`I have never met ${name}.`);
            }
        });

        // Print the users names whose birthdays match the specified date.
        robot.hear(routes.check, function (msg) {
            if (!hasRoles(msg.message.user, [ROLES.admin, ROLES.manager])) {
                msg.send(MSG_PERMISSION_DENIED);
                return;
            }
            let date = msg.match[2], users;
            users = findUsersBornOnDate(moment(date, DATE_FORMATS), robot.brain.data.users);
            if (users.length === 0) {
                return msg.send("Could not find any user with the specified birthday.");
            }
            let userNames = users.map(user => `@${user.name}`), message;
            message = `${userNames.join(', ')}`;
            return msg.send(message);
        });

        // Delete the birthday associated with the specified user name.
        robot.hear(routes.delete, function (msg) {
            if (!hasRoles(msg.message.user, [ROLES.admin, ROLES.manager])) {
                msg.send(MSG_PERMISSION_DENIED);
                return;
            }
            let name = msg.match[2], user, users;
            users = robot.brain.usersForFuzzyName(name);
            if (users.length === 1) {
                user = users[0];
                user.date_of_birth = null;
                return msg.send(`Removing ${name}'s birthday.`);
            } else if (users.length > 1) {
                return msg.send(getAmbiguousUserText(users));
            } else {
                return msg.send(`I have never met ${name}.`);
            }
        });

        // Print users birthdays.
        robot.respond(routes.list, function (msg) {
            let message, messageItems;
            messageItems = Object.values(robot.brain.data.users)
                .filter(user => isValidDate(user.date_of_birth))
                .map(user => `${user.name} was born on ${user.date_of_birth}`);
            message = messageItems.length === 0 ? 'Oops... No results.' : messageItems.join('\n');
            return msg.send(message);
        });

        // Check regularly if today is someone's birthday, write birthday messages to the general channel.
        if (BIRTHDAY_CRON_STRING) {
            schedule.scheduleJob(BIRTHDAY_CRON_STRING, () => sendCongratulations(robot));
        }

        // Send reminders of the upcoming birthdays to the users (except ones whose birthday it is).
        if (ANNOUNCER_CRON_STRING) {
            schedule.scheduleJob(ANNOUNCER_CRON_STRING, () => sendReminders(robot));
        }
    }
}).call(this);
