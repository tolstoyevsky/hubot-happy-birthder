const fs = require('fs')
const moment = require('moment')
const path = require('path')
const routines = require('hubot-routines')

const exp = module.exports = {}

exp.TENOR_API_KEY = process.env.TENOR_API_KEY || ''
exp.TENOR_BLACKLIST = process.env.TENOR_BLACKLIST ? process.env.TENOR_BLACKLIST.split(',') : ['641ee5344bdc3f9f4d3ef52344dfe6bd']
exp.TENOR_IMG_LIMIT = process.env.TENOR_IMG_LIMIT || 50
exp.TENOR_SEARCH_TERM = process.env.TENOR_SEARCH_TERM || 'darthvaderbirthday,futuramabirthday,gameofthronesbirthday,harrypotterbirthday,kingofthehillbirthday,lanadelreybirthday,madhatterbirthday,pulpfictionbirthday,rickandmortybirthday,rocketbirthday,sheldonbirthday,simpsonbirthday,thesimpsonsbirthday,tmntbirthday'
exp.BIRTHDAY_CHANNEL_MESSAGE = (process.env.BIRTHDAY_CHANNEL_MESSAGE || '@%username% is having a birthday soon, so let\'s discuss a present.').split('|')
// Time and measure of it to announce birthdays in advance. For example, 7 days.
exp.BIRTHDAY_CHANNEL_BLACKLIST = (process.env.BIRTHDAY_CHANNEL_BLACKLIST || '').split(',')
exp.BIRTHDAY_CHANNEL_TTL = parseInt(process.env.BIRTHDAY_CHANNEL_TTL, 10) || 3
exp.BIRTHDAY_LOGGING_CHANNEL = process.env.BIRTHDAY_LOGGING_CHANNEL || 'hr'
exp.COMPANY_NAME = process.env.COMPANY_NAME || 'WIS Software'
exp.CREATE_BIRTHDAY_CHANNELS = process.env.CREATE_BIRTHDAY_CHANNELS === 'true' || false
exp.HAPPY_REMINDER_SCHEDULER = process.env.HAPPY_REMINDER_SCHEDULER || '0 0 7 * * *'
exp.NUMBER_OF_DAYS_IN_ADVANCE = parseInt(process.env.NUMBER_OF_DAYS_IN_ADVANCE, 10) || 7
exp.ENABLE_PITCHING_IN_SURVEY = process.env.ENABLE_PITCHING_IN_SURVEY === 'true' || false

exp.MSG_PERMISSION_DENIED = 'Permission denied.'
exp.MSG_INVALID_DATE = 'Invalid date format. Try again.'

// Here are the INPUT format strings which are suitable for the following cases:
// * "DD.MM.YYYY", "D.M.YYYY"
// * "DD.MM", "D.M"
// See https://momentjs.com/docs/#/parsing/string-format/ for details.
exp.DATE_FORMAT = 'D.M.YYYY'
exp.SHORT_DATE_FORMAT = 'D.M'

// Here are the OUTPUT format strings, they follow other rules;
// See https://momentjs.com/docs/#/displaying/ for details.
exp.OUTPUT_SHORT_DATE_FORMAT = 'DD.MM'
exp.OUTPUT_DATE_FORMAT = 'DD.MM.YYYY'

exp.BDAY_EVENT_TYPE = 'bday'
exp.FWD_EVENT_TYPE = 'fwd'

let BIRTHDAY_CHANNEL_MESSAGE_INDEX = 0
let FWD_MESSAGE_INDEX = 0

exp.sorting = (a, b, format) => {
  const first = moment(a, format)
  const second = moment(b, format)

  return first.unix() - second.unix()
}

/**
 * Get the message for specified event depended on the specified condition.
 *
 * @param {String} event - Name of the event.
 * @param {String} condition - Condition which specified how to get message.
 * @returns {String}
 */
exp.getMessage = (event, condition) => {
  let fileName
  let index

  if (event === exp.FWD_EVENT_TYPE) {
    fileName = '/anniversary.txt'
    index = FWD_MESSAGE_INDEX
  }

  if (event === exp.BDAY_EVENT_TYPE) {
    fileName = '/quotes.txt'
    index = BIRTHDAY_CHANNEL_MESSAGE_INDEX
  }

  const quotesPath = path.join(__dirname, fileName)
  let quotes = fs.readFileSync(quotesPath, 'utf8').split('\n')

  if (condition === 'index') {
    if (event === exp.BDAY_EVENT_TYPE) {
      quotes = exp.BIRTHDAY_CHANNEL_MESSAGE
    }
    const result = quotes[index]

    index++
    if (index >= quotes.length) {
      index = 0
    }

    if (event === exp.FWD_EVENT_TYPE) {
      FWD_MESSAGE_INDEX = index
    } else {
      BIRTHDAY_CHANNEL_MESSAGE_INDEX = index
    }

    return result
  }
  if (condition === 'random') {
    return quotes[(Math.random() * quotes.length) >> 0]
  }
}

/**
 * Create a channel and invite all the users to it except the one specified via username.
 *
 * @param {Robot} robot - Hubot instance.
 * @param {string} username - Username of birthday boy/girl.
 * @returns {Void}
 */
exp.createBirthdayChannel = async (robot, username) => {
  const message = exp.getMessage(exp.BDAY_EVENT_TYPE, 'index')
    .replace(/%username%/g, username)
  const now = moment()
  const dayMonth = now.format('DD.MM')
  const channelName = `${username}-birthday-channel-${dayMonth}-id${now.milliseconds()}`
  const users = Object.values(robot.brain.data.users)
    .filter(user => {
      return user.name !== username && !exp.BIRTHDAY_CHANNEL_BLACKLIST.includes(user.name)
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
 * Create a pitching in survey for all users except the birthday boy/girl.
 *
 * @param {Robot} robot - hubot instance
 * @param {object} bdayUser - birthday boy/girl
 */
exp.createPitchingInSurvey = (robot, bdayUser) => {
  return routines.getAllUsers(robot)
    .then(users => {
      users
        .filter(user => user.id !== bdayUser.id)
        .forEach(user => {
          const text = `Hello. ${bdayUser.name} is having a birthday soon. We are pitching in on the present. Are you in? This is a completely anonymous survey. We simply need to know the number of the people who are going to pitch in.`
          const message = routines.buildMessageWithButtons(
            text,
            [
              ['Yes. I can', `Yes, I'll pitch in on a present for ${bdayUser.name}`],
              ['Sorry, but no', `No, I won't pitch in on a present for ${bdayUser.name}`]
            ]
          )
          robot.adapter.sendDirect({ user: { name: user.name } }, message)
        })
    })
}

/**
 * Check if the bot is in the birthday channel.
 *
 * @param {Robot} robot - Hubot instance.
 * @param {string} username - Username of birthday boy/girl.
 * @returns {boolean}
 */
exp.isBotInBirthdayChannel = async (robot, username) => {
  const userInstance = robot.brain.userForName(username)
  if (userInstance.birthdayChannel) {
    return true
  }
  return false
}

exp.getAmbiguousUserText = users => `Be more specific, I know ${users.length} people named like that: ${(Array.from(users).map((user) => user.name)).join(', ')}`

/**
 * Select a random image URL from a list of images (returned by the search).
 *
 * @param {Object} response - Response object from the node-fetch package.
 * @returns {string} - Image URL.
 */
exp.selectTenorImageUrl = (response) => {
  const items = response.results

  const filteredItems = items.filter(item => {
    const re = /^(https?[:]\/\/media.tenor.com\/images\/([0-9a-z]+)\/tenor.gif)$/i
    const match = item.media[0].gif.url.match(re)

    if (!match) {
      return false
    }

    if (exp.TENOR_BLACKLIST.includes(match[2])) {
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
exp.grabTenorImage = async () => {
  let imageUrl
  let response

  const tenorKeyUrl = `https://api.tenor.com/v1/anonid?key=${exp.TENOR_API_KEY}`

  const requestTenor = async () => routines.retryFetch(tenorKeyUrl)
    .then(res => res.json())
    .then(async (res) => {
      const anonId = res.anon_id
      const tags = exp.TENOR_SEARCH_TERM.split(',')
      const chosenTag = tags[Math.floor(Math.random() * tags.length)]
      const searchUrl = `https://api.tenor.com/v1/search?tag=${chosenTag}&key=${exp.TENOR_API_KEY}&limit=${exp.TENOR_IMG_LIMIT}&anon_id=${anonId}`

      response = await routines.retryFetch(searchUrl)

      return response
    })

  let repeat = true
  while (repeat) {
    response = await requestTenor()
    imageUrl = exp.selectTenorImageUrl(await response.json())

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
exp.isEqualMonthDay = (firstDate, secondsDate) => {
  return (firstDate.month() === secondsDate.month()) && (firstDate.date() === secondsDate.date())
}

/**
 * Find the users who have the event in the specified date.
 *
 * @param {String} event - Name of the event.
 * @param {Date} date - Date which will be used for the comparison.
 * @param {Object} users - User object where each key is the user instance.
 * @returns {Array}
 */
exp.findUsersByDate = (event, date, users) => {
  let matches = []
  let attr

  if (event === exp.BDAY_EVENT_TYPE) {
    attr = 'dateOfBirth'
  }

  if (event === exp.FWD_EVENT_TYPE) {
    attr = 'dateOfFwd'
  }

  for (let user of Object.values(users)) {
    if (routines.isValidDate(user[attr], exp.DATE_FORMAT)) {
      if (exp.isEqualMonthDay(date, moment(user[attr], exp.DATE_FORMAT))) {
        matches.push(user)
      }
    }
  }

  return matches
}

/**
 * Form a reminder message
 *
 * @param {Object} users - User object where each key is the user instance.
 * @param {moment} targetDay - Current date.
 * @param {number} amountOfTime - Amount of time before birthday.
 * @returns {string}
 */
exp.formReminderMessage = (users, targetDay, amountOfTime) => {
  const usernames = users.map(user => user.name)
  const commaSeparatedUsernames = usernames.map(name => `@${name}`).join(', ')
  const toBe = users.length > 1 ? 'are' : 'is'
  const when = amountOfTime > 1 ? `on ${targetDay.format(exp.OUTPUT_SHORT_DATE_FORMAT)}` : 'tomorrow'
  const message = `${commaSeparatedUsernames} ${toBe} having a birthday ${when}.`

  return message
}

/**
 * Form a fwd message by concatenate usernames and years of being worker.
 *
 * @param {Array} users - Users to be congratulated.
 * @returns {string}
 */
exp.formFwdMessage = (users) => {
  let count = []

  for (const user of users) {
    const dateOfFwd = moment(user.dateOfFwd, exp.DATE_FORMAT)
    let diff = moment().diff(dateOfFwd, 'years')
    if (diff) {
      let cases = diff > 1 ? 'years' : 'year'
      count.push(`@${user.name} has been a part of our team for ${diff} ${cases}`)
    }
  }
  if (count) {
    return `${count.join(' and\n')}`
  }
  return ''
}

/**
 * Find all the birthdays which were yesterday and remove the channels created for them.
 *
 * @param {Robot} robot - Hubot instance.
 * @returns {Void}
 */
exp.removeExpiredBirthdayChannels = async (robot) => {
  if (!exp.CREATE_BIRTHDAY_CHANNELS) {
    return
  }

  let targetDay = moment()
  let users = []
  let channelName

  targetDay.add(-exp.BIRTHDAY_CHANNEL_TTL, 'day')
  for (const bdayUser of exp.findUsersByDate(exp.BDAY_EVENT_TYPE, targetDay, robot.brain.data.users)) {
    if (await routines.isUserActive(robot, bdayUser)) {
      users.push(bdayUser)
    }
  }

  if (users.length) {
    for (let user of users) {
      if (await exp.isBotInBirthdayChannel(robot, user.name)) {
        const userInstance = robot.brain.userForName(user.name)
        if (userInstance.birthdayChannel) {
          channelName = userInstance.birthdayChannel.roomName
          await robot.adapter.api.post('groups.delete', { roomName: channelName })
          delete userInstance.birthdayChannel
          delete userInstance.birthdayPitchingInList
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
exp.sendReminders = async (robot, amountOfTime, unitOfTime) => {
  let targetDay = moment()
  let users = []

  targetDay.add(amountOfTime, unitOfTime)

  for (const bdayUser of exp.findUsersByDate(exp.BDAY_EVENT_TYPE, targetDay, robot.brain.data.users)) {
    if (await routines.isUserActive(robot, bdayUser)) {
      users.push(bdayUser)
    }
  }

  if (users.length > 0) {
    for (let user of users) {
      if (!await exp.isBotInBirthdayChannel(robot, user.name)) {
        if (exp.CREATE_BIRTHDAY_CHANNELS) {
          await exp.createBirthdayChannel(robot, user.name)
        }

        if (exp.ENABLE_PITCHING_IN_SURVEY) {
          await exp.createPitchingInSurvey(robot, user)
        }
      }
    }

    const allUsers = Object.values(robot.brain.data.users)
    for (let user of allUsers) {
      const filteredUsers = users.filter(item => item.name !== user.name)
      if (!filteredUsers.length) {
        continue
      }
      const message = exp.formReminderMessage(filteredUsers, targetDay, amountOfTime)
      robot.adapter.sendDirect({ user: { name: user.name } }, message)
    }
  }
}

/**
 * Write congratulation messages to the general channel.
 *
 * @param {Object} robot - Hubot instance.
 * @param {String} event - Name of the event to form congratulation.
 */
exp.sendCongratulations = async (robot, event) => {
  let messageText
  let sortedUsers = []
  let tenor

  for (const user of exp.findUsersByDate(event, moment(), robot.brain.data.users)) {
    if (await routines.isUserActive(robot, user)) {
      sortedUsers.push(user)
    }
  }

  if (sortedUsers.length > 0) {
    let userNames = sortedUsers.map(user => `@${user.name}`)

    if (event === exp.BDAY_EVENT_TYPE) {
      messageText = `Today is birthday of ${userNames.join(' and ')}!\n${exp.getMessage(event, 'random')}`
      tenor = true
    }

    if (event === exp.FWD_EVENT_TYPE) {
      let message = exp.formFwdMessage(sortedUsers)

      if (!message) {
        return
      }

      let congrat = exp.getMessage(event, 'index')
      messageText = `${congrat}\n${message}!`
      tenor = false
    }

    if (tenor) {
      exp.grabTenorImage()
        .then(function (imageUrl) {
          robot.messageRoom('general', `${imageUrl || ''}\n${messageText}`)
        })
        .catch((e) => {
          robot.messageRoom('general', messageText)
          routines.rave(robot, e)
        })
    } else {
      robot.messageRoom('general', messageText)
    }
  }
}

/**
 * Detect the birthdayless users and remind
 * * the users of the need for specifying their birth date;
 * * everyone in the channel specified via BIRTHDAY_LOGGING_CHANNEL that there are forgetful users.
 *
 * @param {Robot} robot - Hubot instance.
 * @return {void}
 */
exp.detectBirthdaylessUsers = async robot => {
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
      robot.messageRoom(exp.BIRTHDAY_LOGGING_CHANNEL, `There are the users who did not set the date of birth:\n${userList.join('\n')}`)
    } else {
      robot.messageRoom(exp.BIRTHDAY_LOGGING_CHANNEL, `${userList[0]} did not set the date of birth.`)
    }
  }
}

/**
 * Inform everybody in the birthday channel about the number of people who agreed to pitch in.
 *
 * @param {Robot} robot - hubot instance.
 */
exp.sendReminderOfBegging = async (robot) => {
  const targetDay = moment().add(4, 'days')
  const users = await routines.getAllUsers(robot)

  return users
    .filter(user => {
      return exp.isEqualMonthDay(
        moment(user.dateOfBirth, exp.DATE_FORMAT),
        targetDay
      )
    })
    .forEach(user => {
      const all = users.length - 1
      const agreed = (user.birthdayPitchingInList || []).length
      const toBe = agreed > 1 ? 'are' : 'is'

      const message = `Good news, @all\n${agreed} out of ${all} ${toBe} going to pitch in.`

      robot.messageRoom(user.birthdayChannel.roomName, message)
    })
}
