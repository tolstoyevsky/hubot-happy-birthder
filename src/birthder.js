// Description:
//   Birthday bot.
//
// Configuration:
//   None
//
// Commands:
//   hubot birthdays list - shows a list of users and their birthdays
//   hubot birthday set <username> <date>.<month>.<year> - sets a birthday for the user (privileged: admins only)
//   hubot birthdays on <date>.<month> - shows a list of users with a set birthday date
//   hubot birthday delete <username> - deletes birthday for the user (privileged: admins only)
//

(function () {
  const fs = require('fs')
  const moment = require('moment')
  const path = require('path')
  const routines = require('hubot-routines')
  const schedule = require('node-schedule')

  const TENOR_API_KEY = process.env.TENOR_API_KEY || ''
  const TENOR_BLACKLIST = process.env.TENOR_BLACKLIST ? process.env.TENOR_BLACKLIST.split(',') : ['641ee5344bdc3f9f4d3ef52344dfe6bd']
  const TENOR_IMG_LIMIT = process.env.TENOR_IMG_LIMIT || 50
  const TENOR_SEARCH_TERM = process.env.TENOR_SEARCH_TERM || 'darthvaderbirthday,futuramabirthday,gameofthronesbirthday,harrypotterbirthday,kingofthehillbirthday,lanadelreybirthday,madhatterbirthday,pulpfictionbirthday,rickandmortybirthday,rocketbirthday,sheldonbirthday,simpsonbirthday,thesimpsonsbirthday,tmntbirthday'
  const BIRTHDAY_CHANNEL_MESSAGE = (process.env.BIRTHDAY_CHANNEL_MESSAGE || '@%username% is having a birthday soon, so let\'s discuss a present.').split('|')
  // Time and measure of it to announce birthdays in advance. For example, 7 days.
  const BIRTHDAY_CHANNEL_BLACKLIST = (process.env.BIRTHDAY_CHANNEL_BLACKLIST || '').split(',')
  const BIRTHDAY_CHANNEL_TTL = parseInt(process.env.BIRTHDAY_CHANNEL_TTL, 10) || 3
  const BIRTHDAY_LOGGING_CHANNEL = process.env.BIRTHDAY_LOGGING_CHANNEL || 'hr'
  const COMPANY_NAME = process.env.COMPANY_NAME || 'WIS Software'
  const CREATE_BIRTHDAY_CHANNELS = process.env.CREATE_BIRTHDAY_CHANNELS === 'true' || false
  const HAPPY_REMINDER_SCHEDULER = process.env.HAPPY_REMINDER_SCHEDULER || '0 0 7 * * *'
  const NUMBER_OF_DAYS_IN_ADVANCE = parseInt(process.env.NUMBER_OF_DAYS_IN_ADVANCE, 10) || 7

  const MSG_PERMISSION_DENIED = 'Permission denied.'
  const MSG_INVALID_DATE = 'Invalid date format. Try again.'

  // Here are the INPUT format strings which are suitable for the following cases:
  // * "DD.MM.YYYY", "D.M.YYYY"
  // * "DD.MM", "D.M"
  // See https://momentjs.com/docs/#/parsing/string-format/ for details.
  const DATE_FORMAT = 'D.M.YYYY'
  const SHORT_DATE_FORMAT = 'D.M'

  // Here are the OUTPUT format strings, they follow other rules;
  // See https://momentjs.com/docs/#/displaying/ for details.
  const OUTPUT_SHORT_DATE_FORMAT = 'DD.MM'
  const OUTPUT_DATE_FORMAT = 'DD.MM.YYYY'

  const QUOTES_PATH = path.join(__dirname, '/quotes.txt')
  const QUOTES = fs.readFileSync(QUOTES_PATH, 'utf8').toString().split('\n')

  let BIRTHDAY_CHANNEL_MESSAGE_INDEX = 0

  const sorting = (a, b, format) => {
    const first = moment(a, format)
    const second = moment(b, format)

    return first.unix() - second.unix()
  }

  /**
   * Get the BIRTHDAY_CHANNEL_MESSAGE list and switches the status to the next message.
   *
   * @returns {String}
   */
  function getBirthdayChannelMessage () {
    const result = BIRTHDAY_CHANNEL_MESSAGE[BIRTHDAY_CHANNEL_MESSAGE_INDEX]

    BIRTHDAY_CHANNEL_MESSAGE_INDEX++
    if (BIRTHDAY_CHANNEL_MESSAGE_INDEX >= BIRTHDAY_CHANNEL_MESSAGE.length) {
      BIRTHDAY_CHANNEL_MESSAGE_INDEX = 0
    }

    return result
  }

  /**
   * Create a channel and invite all the users to it except the one specified via username.
   *
   * @param {Robot} robot - Hubot instance.
   * @param {string} username - Username of birthday boy/girl.
   * @returns {Void}
   */
  const createBirthdayChannel = async (robot, username) => {
    const message = getBirthdayChannelMessage()
      .replace(/%username%/g, username)
    const now = moment()
    const dayMonth = now.format('DD.MM')
    const channelName = `${username}-birthday-channel-${dayMonth}-id${now.milliseconds()}`
    const users = Object.values(robot.brain.data.users)
      .filter(user => {
        return user.name !== username && !BIRTHDAY_CHANNEL_BLACKLIST.includes(user.name)
      })
      .map(user => user.name)
    await robot.adapter.api.post('groups.create', {
      name: channelName,
      members: users
    })
    const userInstance = robot.brain.userForName(username)
    userInstance.birthdayChannel = {
      roomName: channelName
    }
    robot.messageRoom(channelName, message)
  }

  /**
   * Check if the bot is in the birthday channel.
   *
   * @param {Robot} robot - Hubot instance.
   * @param {string} username - Username of birthday boy/girl.
   * @returns {boolean}
   */
  const isBotInBirthdayChannel = async (robot, username) => {
    const userInstance = robot.brain.userForName(username)
    if (userInstance.birthdayChannel) {
      return true
    }
    return false
  }

  const getAmbiguousUserText = users => `Be more specific, I know ${users.length} people named like that: ${(Array.from(users).map((user) => user.name)).join(', ')}`

  /**
   * Select a random image URL from a list of images (returned by the search).
   *
   * @param {Object} response - Response object from the node-fetch package.
   * @returns {string} - Image URL.
   */
  function selectTenorImageUrl (response) {
    const items = response.results

    const filteredItems = items.filter(item => {
      const re = /^(https?[:]\/\/media.tenor.com\/images\/([0-9a-z]+)\/tenor.gif)$/i
      const match = item.media[0].gif.url.match(re)

      if (!match) {
        return false
      }

      if (TENOR_BLACKLIST.includes(match[2])) {
        console.log('Tenor returned the image from the blacklist specified via TENOR_BLACKLIST. Retrying...')
        return false
      }

      return true
    })

    if (!filteredItems.length) {
      return ''
    }

    return filteredItems[Math.floor(Math.random() * filteredItems.length)]
      .media[0].gif.url
  }

  /**
   * Get an image URL through Tenor's GIF API.
   * TENOR_API_KEY, TENOR_SEARCH_TERM and TENOR_IMG_LIMIT are used as request params.
   *
   * @returns {Promise<string|*>} - Image URL.
   */
  async function grabTenorImage () {
    let imageUrl
    let response

    const tenorKeyUrl = `https://api.tenor.com/v1/anonid?key=${TENOR_API_KEY}`

    const requestTenor = async () => routines.retryFetch(tenorKeyUrl)
      .then(res => res.json())
      .then(async (res) => {
        const anonId = res.anon_id
        const tags = TENOR_SEARCH_TERM.split(',')
        const chosenTag = tags[Math.floor(Math.random() * tags.length)]
        const searchUrl = `https://api.tenor.com/v1/search?tag=${chosenTag}&key=${TENOR_API_KEY}&limit=${TENOR_IMG_LIMIT}&anon_id=${anonId}`

        response = await routines.retryFetch(searchUrl)

        return response
      })

    let repeat = true
    while (repeat) {
      response = await requestTenor()
      imageUrl = selectTenorImageUrl(await response.json())

      if (imageUrl) {
        repeat = false
      } else {
        console.log('No images returned. New Tenor API request')
      }
    }

    return imageUrl
  }

  /**
   * Check if two specified dates have the same month and day.
   *
   * @param {moment} firstDate - First date for comparison.
   * @param {moment} secondsDate - Second date for comparison.
   * @returns {boolean}
   */
  function isEqualMonthDay (firstDate, secondsDate) {
    return (firstDate.month() === secondsDate.month()) && (firstDate.date() === secondsDate.date())
  }

  /**
   * Find the users who have the same birthday.
   *
   * @param {Date} date - Date which will be used for the comparison.
   * @param {Object} users - User object where each key is the user instance.
   * @returns {Array}
   */
  function findUsersBornOnDate (date, users) {
    let matches = []

    for (let user of Object.values(users)) {
      if (routines.isValidDate(user.dateOfBirth, DATE_FORMAT)) {
        if (isEqualMonthDay(date, moment(user.dateOfBirth, DATE_FORMAT))) {
          matches.push(user)
        }
      }
    }

    return matches
  }

  /**
   * Get a random quote from the QUOTES array.
   *
   * @returns {string}
   */
  function quote () {
    return QUOTES[(Math.random() * QUOTES.length) >> 0]
  }

  /**
   * Form a reminder message
   *
   * @param {Object} users - User object where each key is the user instance.
   * @param {moment} targetDay - Current date.
   * @param {number} amountOfTime - Amount of time before birthday.
   * @returns {string}
   */
  function formReminderMessage (users, targetDay, amountOfTime) {
    const usernames = users.map(user => user.name)
    const commaSeparatedUsernames = usernames.map(name => `@${name}`).join(', ')
    const toBe = users.length > 1 ? 'are' : 'is'
    const when = amountOfTime > 1 ? `on ${targetDay.format(OUTPUT_SHORT_DATE_FORMAT)}` : 'tomorrow'
    const message = `${commaSeparatedUsernames} ${toBe} having a birthday ${when}.`

    return message
  }

  /**
   * Find all the birthdays which were yesterday and remove the channels created for them.
   *
   * @param {Robot} robot - Hubot instance.
   * @returns {Void}
   */
  async function removeExpiredBirthdayChannels (robot) {
    if (!CREATE_BIRTHDAY_CHANNELS) {
      return
    }

    let targetDay = moment()
    let users = []
    let channelName

    targetDay.add(-BIRTHDAY_CHANNEL_TTL, 'day')
    for (const bdayUser of findUsersBornOnDate(targetDay, robot.brain.data.users)) {
      if (await routines.isUserActive(robot, bdayUser)) {
        users.push(bdayUser)
      }
    }

    if (users.length) {
      for (let user of users) {
        if (await isBotInBirthdayChannel(robot, user.name)) {
          const userInstance = robot.brain.userForName(user.name)
          if (userInstance.birthdayChannel) {
            channelName = userInstance.birthdayChannel.roomName
            await robot.adapter.api.post('groups.delete', { roomName: channelName })
            delete userInstance.birthdayChannel
          }
        }
      }
    }
  }

  /**
   * Send reminders of the upcoming birthdays to the users (except ones whose birthday it is).
   *
   * @param {Object} robot - Hubot instance.
   */
  async function sendReminders (robot, amountOfTime, unitOfTime) {
    let targetDay = moment()
    let users = []

    targetDay.add(amountOfTime, unitOfTime)

    for (const bdayUser of findUsersBornOnDate(targetDay, robot.brain.data.users)) {
      if (await routines.isUserActive(robot, bdayUser)) {
        users.push(bdayUser)
      }
    }

    if (users.length > 0) {
      if (CREATE_BIRTHDAY_CHANNELS) {
        for (let user of users) {
          if (!await isBotInBirthdayChannel(robot, user.name)) {
            await createBirthdayChannel(robot, user.name)
          }
        }
      }

      const allUsers = Object.values(robot.brain.data.users)
      for (let user of allUsers) {
        const filteredUsers = users.filter(item => item.name !== user.name)
        if (!filteredUsers.length) {
          continue
        }
        const message = formReminderMessage(filteredUsers, targetDay, amountOfTime)
        robot.adapter.sendDirect({ user: { name: user.name } }, message)
      }
    }
  }

  /**
   * Write birthday messages to the general channel.
   *
   * @param {Object} robot - Hubot instance.
   */
  async function sendCongratulations (robot) {
    let users = []
    for (const bdayUser of findUsersBornOnDate(moment(), robot.brain.data.users)) {
      if (await routines.isUserActive(robot, bdayUser)) {
        users.push(bdayUser)
      }
    }

    if (users.length > 0) {
      let userNames = users.map(user => `@${user.name}`)
      let messageText = `Today is birthday of ${userNames.join(' and ')}!\n${quote()}`
      grabTenorImage()
        .then(function (imageUrl) {
          robot.messageRoom('general', `${imageUrl || ''}\n${messageText}`)
        })
        .catch((e) => {
          robot.messageRoom('general', messageText)
          routines.rave(robot, e)
        })
    }
  }

  module.exports = async (robot) => {
    // Checking if the bot is in the channel specified via the BIRTHDAY_LOGGING_CHANNEL environment variable.
    const botChannels = await robot.adapter.api.get('channels.list.joined')
    const botGroups = await robot.adapter.api.get('groups.list')
    const chExists = botChannels.channels.filter(item => item.name === BIRTHDAY_LOGGING_CHANNEL).length
    const grExists = botGroups.groups.filter(item => item.name === BIRTHDAY_LOGGING_CHANNEL).length
    if (!chExists && !grExists) {
      routines.rave(robot, `Hubot is not in the group or channel named '${BIRTHDAY_LOGGING_CHANNEL}'`)
      return
    }

    const regExpUsername = new RegExp(/(?:@?(.+))/)
    const regExpDate = new RegExp(/((\d{1,2})\.(\d{1,2})\.(\d{4}))\b/)
    const regExpShortDate = new RegExp(/((\d{1,2})\.(\d{1,2}))\b/)

    const routes = {
      set: new RegExp(/(birthday set)\s+/.source + regExpUsername.source + /\s+/.source + regExpDate.source, 'i'),
      delete: new RegExp(/(birthday delete)\s+/.source + regExpUsername.source + /\b/.source, 'i'),
      check: new RegExp(/(birthdays on)\s+/.source + regExpShortDate.source, 'i'),
      list: new RegExp(/birthdays list$/, 'i')
    }

    if (TENOR_API_KEY === '') {
      routines.rave(robot, 'TENOR_API_KEY is a mandatory parameter, however it\'s not specified.')
      return
    }

    /**
     * Detect the birthdayless users and remind
     * * the users of the need for specifying their birth date;
     * * everyone in the channel specified via BIRTHDAY_LOGGING_CHANNEL that there are forgetful users.
     *
     * @param {Robot} robot - Hubot instance.
     * @return {void}
     */
    const detectBirthdaylessUsers = async robot => {
      let usersWithoutBirthday = Object.values(robot.brain.data.users)
        .filter(user => !user.dateOfBirth)
      let formattedArray = []

      for (const i in usersWithoutBirthday) {
        const user = usersWithoutBirthday[i]
        const valid = await routines.doesUserExist(robot, user) && await routines.isUserActive(robot, user)
        if (valid) formattedArray.push(user)
      }

      for (const user of formattedArray) {
        robot.adapter.sendDirect({ user: { name: user.name } }, 'Hmm... \nIt looks like you forgot to set the date of birth. \nPlease enter it (DD.MM.YYYY).')
      }
      const userList = formattedArray.map(user => ` @${user.name} `)
      if (userList.length) {
        if (userList.length > 1) {
          robot.messageRoom(BIRTHDAY_LOGGING_CHANNEL, `There are the users who did not set the date of birth:\n${userList.join('\n')}`)
        } else {
          robot.messageRoom(BIRTHDAY_LOGGING_CHANNEL, `${userList[0]} did not set the date of birth.`)
        }
      }
    }

    robot.enter(msg => {
      if (msg.message.user.roomID === 'GENERAL') {
        const brain = robot.brain.data.users
        const username = msg.message.user.name
        const user = Object.values(brain).filter(item => item.name === username).shift()
        if (!user.dateOfBirth) {
          robot.adapter.sendDirect({ user: { name: user.name } }, `Welcome to ${COMPANY_NAME}! :tada:\nEmm... where was I?\nOh! Please, enter your date birth (DD.MM.YYYY).`)
        }
      }
    })

    robot.respond(regExpDate, msg => {
      const username = msg.message.user.name
      const user = robot.brain.userForName(username)
      const date = msg.match[1]

      if (!user.dateOfBirth) {
        if (routines.isValidDate(date, DATE_FORMAT)) {
          user.dateOfBirth = date
          msg.send('I memorized you birthday, well done! :wink:')
          robot.messageRoom(BIRTHDAY_LOGGING_CHANNEL, `All right, @${user.name}'s birthday was specified!`)
        } else {
          msg.send(MSG_INVALID_DATE)
        }
      }
    })

    // Link together the specified birthday and user and store the link in the brain.
    robot.respond(routes.set, async (msg) => {
      let date
      let name
      let user
      let users

      if (!await routines.isAdmin(robot, msg.message.user.name.toString())) {
        msg.send(MSG_PERMISSION_DENIED)
        return
      }

      name = msg.match[2].trim()
      date = msg.match[3]
      users = []

      for (const u of robot.brain.usersForFuzzyName(name)) {
        if (await routines.isUserActive(robot, u)) {
          users.push(u)
        }
      }

      if (!routines.isValidDate(date, DATE_FORMAT)) {
        msg.send(MSG_INVALID_DATE)
        return
      }

      if (users.length === 1) {
        user = users[0]
        user.dateOfBirth = date

        return msg.send(`Saving ${name}'s birthday.`)
      } else if (users.length > 1) {
        return msg.send(getAmbiguousUserText(users))
      } else {
        return msg.send(`I have never met ${name}.`)
      }
    })

    // Print the users names whose birthdays match the specified date.
    robot.respond(routes.check, async (msg) => {
      let date
      let message
      let users = []
      let userNames

      date = msg.match[2]

      for (const u of findUsersBornOnDate(moment(date, SHORT_DATE_FORMAT), robot.brain.data.users)) {
        if (await routines.isUserActive(robot, u)) {
          users.push(u)
        }
      }

      if (users.length === 0) {
        return msg.send('Could not find any user with the specified birthday.')
      }

      userNames = users.map(user => `@${user.name}`)
      message = `${userNames.join(', ')}`

      return msg.send(message)
    })

    // Delete the birthday associated with the specified user name.
    robot.respond(routes.delete, async (msg) => {
      let name = msg.match[2].trim()
      let user
      let users = []

      if (!await routines.isAdmin(robot, msg.message.user.name.toString())) {
        msg.send(MSG_PERMISSION_DENIED)
        return
      }

      for (const u of robot.brain.usersForFuzzyName(name)) {
        if (await routines.isUserActive(robot, u)) {
          users.push(u)
        }
      }

      if (users.length === 1) {
        user = users[0]
        if (!user.dateOfBirth) {
          return msg.send('A birth date is not specified for the user.')
        }

        user.dateOfBirth = null

        return msg.send(`Removing ${name}'s birthday.`)
      } else if (users.length > 1) {
        return msg.send(getAmbiguousUserText(users))
      } else {
        return msg.send(`I have never met ${name}.`)
      }
    })

    // Print sorted users birthdays.
    robot.respond(routes.list, async function (msg) {
      let message

      const allUsers = []
      for (const u of Object.values(robot.brain.data.users)) {
        if (await routines.isUserActive(robot, u)) {
          allUsers.push(u)
        }
      }

      message = allUsers
        .filter(user => routines.isValidDate(user.dateOfBirth, DATE_FORMAT))
        .map(user => {
          const thisYear = moment().year()
          const date = moment(user.dateOfBirth, DATE_FORMAT).year(thisYear)
          const sortedDate = date.unix() >= moment().unix()
            ? date.format(`DD.MM.${date.year() - 1}`) : date.format(`DD.MM.${date.year()}`)

          return {
            name: user.name,
            dateOfBirth: user.dateOfBirth,
            sortedDate: sortedDate
          }
        })
        .sort((a, b) => sorting(a.sortedDate, b.sortedDate, 'DD.MM.YYYY'))
        .map(user => ` @${user.name} was born on ${moment(user.dateOfBirth, DATE_FORMAT).format(OUTPUT_DATE_FORMAT)}`)

      if (!message.length) {
        msg.send('Oops... No results.')
        return
      }

      msg.send(`*Birthdays list*\n${message.join('\n')}`)
    })

    // Check regularly if today is someone's birthday, write birthday messages to the general channel.
    if (HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(HAPPY_REMINDER_SCHEDULER, () => sendCongratulations(robot))
    }

    // Send reminders of the upcoming birthdays to the users (except ones whose birthday it is).

    if (HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(HAPPY_REMINDER_SCHEDULER, () => sendReminders(robot, NUMBER_OF_DAYS_IN_ADVANCE, 'days'))
    }

    if (HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(HAPPY_REMINDER_SCHEDULER, () => sendReminders(robot, 1, 'day'))
    }

    if (HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(HAPPY_REMINDER_SCHEDULER, () => removeExpiredBirthdayChannels(robot))
    }

    if (HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(HAPPY_REMINDER_SCHEDULER, () => detectBirthdaylessUsers(robot))
    }
  }
}).call(this)
