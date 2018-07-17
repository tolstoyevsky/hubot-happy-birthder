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
//   list birthdays - shows a list of users and their birthdays
//   birthday set <username> <date>/<month>/<year> - sets a birthday for the user
//   birthdays on <date>/<month>/<year> - shows a list of users with a set birthday date
//   birthday delete <username> - deletes birthday for the user
//
// Author:
//   6r1d
(function () {
    const schedule = require('node-schedule');
    const moment = require('moment');
    const n_fetch = require('node-fetch');

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

    // Selects random image URI from a list of images (returned by the search)
    function select_tenor_image_url(response_objects) {
        let top_anims = response_objects.results;
        let rand_anim = top_anims[Math.floor(Math.random() * top_anims.length)];
        return rand_anim.media[0].gif.url;
    }

    async function grab_tenor_image() {
        let img_url, anon_id, response, tenor_key_response;
        let tenor_key_url = "https://api.tenor.com/v1/anonid?key=" + TENOR_API_KEY;

        response = await n_fetch(tenor_key_url);
        tenor_key_response = await response.json();
        // TODO process output for the wrong key, invalid input and so on
        anon_id = tenor_key_response.anon_id;

        let search_url = "https://api.tenor.com/v1/search?tag=" +
            TENOR_SEARCH_TERM + "&key=" +
            TENOR_API_KEY + "&limit=" +
            TENOR_IMG_LIMIT + "&anon_id=" + anon_id;
        // TODO process invalid inputs:
        // check if response might be parsed as JSON,
        // check if input dict contains required keys
        response = await n_fetch(search_url);
        img_url = select_tenor_image_url(await response.json());

        return img_url;
    }

    module.exports = function (robot) {
        let set_regex = /(birthday set) (?:@?([\w\d .\-_]+)\?*) ((0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[0-2])\/([\d]{4}))\b/i;
        let check_regex = /(birthdays on) ((0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[0-2])\/([\d]{4}))\b/i;
        let delete_regex = /(birthday delete) (?:@?([\w\d .\-_]+)\?*)\b/i;

        // returns `true` if two dates have the same month and day of month
        function check_dates_equal(dayA, dayB) {
            return (dayA.month() === dayB.month()) && (dayA.date() === dayB.date());
        }

        // returns `true` is date string is a valid date
        function is_valid_birthdate(date) {
            if (date) {
                if (date.length > 0) {
                    if (moment(date, "DD-MM-YYYY").isValid) {
                        return true;
                    }
                }
            }
            return false;
        }

        // returns `array` of users born on a given date
        function find_users_born_on_date(date, users) {
            let uid, matches, user;
            matches = [];
            for (uid in users || {}) {
                if (users.hasOwnProperty(uid)) {

                    user = users[uid];
                    if (is_valid_birthdate(user.date_of_birth)) {
                        if (check_dates_equal(date, moment(user.date_of_birth, "DD-MM-YYYY"))) {
                            matches.push(user);
                        }
                    }

                }
            }
            return matches;
        }

        // Set someone's birthday
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
            let date, name, user, users;
            date = msg.match[2];
            users = find_users_born_on_date(moment(date, "DD-MM-YYYY"), robot.brain.data.users);
            if (users.length > 0) {
                let resp = `${date} день рождения у `;
                for (idx = i = 0, len = users.length; i < len; idx = ++i) {
                    user = users[idx];
                    resp += `<@${user.name}>${(idx !== (users.length - 1) ? ", " : "")}`;
                }
                resp += ".";
                resp += `\n${quote()}`;
                return msg.send(resp);
            } else {
                return msg.send(MSG_UNABLE_TO_LOCATE_USERS);
            }
        });

        // Delete someone's birthday
        robot.hear(delete_regex, function (msg) {
            let date, name, user, users;
            name = msg.match[2];

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

        robot.respond(/list birthdays/i, function (msg) {
            let k, message, user, users;
            users = robot.brain.data.users;
            if (users.length === 0) {
                return msg.send(MSG_BIRTHDAYS_UNKNOWN);
            } else {
                message = "";
                for (k in users || {}) {
                    user = users[k];
                    if (is_valid_birthdate(user.date_of_birth)) {
                        message += `${user.name} родился ${user.date_of_birth}\n`;
                    }
                }
                return msg.send(message);
            }
        });

        // TODO quotes for a single birthday, quotes for multiple
        function general_birthday_announcement(robot, birthday_users, image_url) {
            let msg = image_url ? image_url + `\n` : '';
            if (birthday_users.length === 1) {
                // send message for one users birthday
                msg += `<!channel> Сегодня день рождения <@${birthday_users[0].name}>!`;
                msg += `\n${quote()}`;
            } else if (birthday_users.length > 1) {
                // send message for multiple users birthdays
                msg += "<!channel> Сегодня день рождения ";
                for (idx = i = 0, len = birthday_users.length; i < len; idx = ++i) {
                    user = birthday_users[idx];
                    msg += `<@${user.name}>${(idx !== (birthday_users.length - 1) ? ", " : "")}`;
                }
                msg += "!";
                msg += `\n${quote()}`;
            }
            if (birthday_users.length > 0) {
                return robot.messageRoom("general", msg);
            }
        }

        // Regularly checks for a birthday, announces to "generic" chat room
        if (BIRTHDAY_CRON_STRING) {
            schedule.scheduleJob(BIRTHDAY_CRON_STRING, function () {
                let birthday_users, i, idx, len, msg, user;
                birthday_users = find_users_born_on_date(moment(), robot.brain.data.users);
                let birthday_announcement = function (image_url) {
                    general_birthday_announcement(robot, birthday_users, image_url);
                };
                // Use Tenor images if possible, ignore images otherwise
                if (TENOR_API_KEY && TENOR_IMG_LIMIT && TENOR_SEARCH_TERM) {
                    grab_tenor_image().then(birthday_announcement).catch(
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
                birthday_users = find_users_born_on_date(after_an_interval, robot.brain.data.users);
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

        return quote = function (name) {
            return QUOTES[(Math.random() * QUOTES.length) >> 0];
        };
    }
}).call(this);
