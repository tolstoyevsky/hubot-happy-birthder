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
//   hubot fwd set <username> <date>.<month>.<year> - sets a first working day for the user (privileged: admins only)
//   hubot fwd list - shows a list of users and their first working days
//

(function () {
  const moment = require('moment')
  const routines = require('hubot-routines')
  const schedule = require('node-schedule')

  const utils = require('./utils')

  module.exports = async (robot) => {
    // Checking if the bot is in the channel specified via the BIRTHDAY_LOGGING_CHANNEL environment variable.
    const botChannels = await robot.adapter.api.get('channels.list.joined')
    const botGroups = await robot.adapter.api.get('groups.list')
    const chExists = botChannels.channels.filter(item => item.name === utils.BIRTHDAY_LOGGING_CHANNEL).length
    const grExists = botGroups.groups.filter(item => item.name === utils.BIRTHDAY_LOGGING_CHANNEL).length
    if (!chExists && !grExists) {
      routines.rave(robot, `Hubot is not in the group or channel named '${utils.BIRTHDAY_LOGGING_CHANNEL}'`)
      return
    }

    const regExpUsername = new RegExp(/(?:@?(.+))/)
    const regExpDate = new RegExp(/((\d{1,2})\.(\d{1,2})\.(\d{4}))\b/)
    const regExpShortDate = new RegExp(/((\d{1,2})\.(\d{1,2}))\b/)

    const routes = {
      set: new RegExp(/(birthday set)\s+/.source + regExpUsername.source + /\s+/.source + regExpDate.source, 'i'),
      delete: new RegExp(/(birthday delete)\s+/.source + regExpUsername.source + /\b/.source, 'i'),
      check: new RegExp(/(birthdays on)\s+/.source + regExpShortDate.source, 'i'),
      list: new RegExp(/(birthdays|fwd) list$/, 'i'),
      fwd_set: new RegExp(/(fwd set)\s+/.source + regExpUsername.source + /\s+/.source + regExpDate.source, 'i')
    }

    if (utils.TENOR_API_KEY === '') {
      routines.rave(robot, 'TENOR_API_KEY is a mandatory parameter, however it\'s not specified.')
      return
    }

    robot.enter(msg => {
      if (msg.message.user.roomID === 'GENERAL') {
        const brain = robot.brain.data.users
        const username = msg.message.user.name
        const user = Object.values(brain).filter(item => item.name === username).shift()
        if (!user.dateOfBirth) {
          robot.adapter.sendDirect({ user: { name: user.name } }, `Welcome to ${utils.COMPANY_NAME}! :tada:\nEmm... where was I?\nOh! Please, enter your date birth (DD.MM.YYYY).`)
        }
        const today = moment().format(utils.OUTPUT_DATE_FORMAT)
        user.dateOfFwd = today
      }
    })

    robot.respond(regExpDate, msg => {
      const username = msg.message.user.name
      const user = robot.brain.userForName(username)
      const date = msg.match[1]

      if (!user.dateOfBirth) {
        if (routines.isValidDate(date, utils.DATE_FORMAT)) {
          user.dateOfBirth = date
          msg.send('I memorized you birthday, well done! :wink:')
          robot.messageRoom(utils.BIRTHDAY_LOGGING_CHANNEL, `All right, @${user.name}'s birthday was specified!`)
        } else {
          msg.send(utils.MSG_INVALID_DATE)
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
        msg.send(utils.MSG_PERMISSION_DENIED)
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

      if (!routines.isValidDate(date, utils.DATE_FORMAT)) {
        msg.send(utils.MSG_INVALID_DATE)
        return
      }

      if (users.length === 1) {
        user = users[0]
        user.dateOfBirth = date

        return msg.send(`Saving ${name}'s birthday.`)
      } else if (users.length > 1) {
        return msg.send(utils.getAmbiguousUserText(users))
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

      for (const u of utils.findUsersBornOnDate(moment(date, utils.SHORT_DATE_FORMAT), robot.brain.data.users)) {
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
        msg.send(utils.MSG_PERMISSION_DENIED)
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
        return msg.send(utils.getAmbiguousUserText(users))
      } else {
        return msg.send(`I have never met ${name}.`)
      }
    })

    // Print sorted users birthdays and first working days.
    robot.respond(routes.list, async (msg) => {
      let attr, desc, title

      if (msg.match[1] === 'birthdays') {
        attr = 'dateOfBirth'
        desc = `was born on`
        title = `Birthdays`
      }
      if (msg.match[1] === 'fwd') {
        attr = 'dateOfFwd'
        desc = `joined our team`
        title = `First working days`
      }

      let message

      const allUsers = []
      for (const u of Object.values(robot.brain.data.users)) {
        if (await routines.isUserActive(robot, u)) {
          allUsers.push(u)
        }
      }

      message = allUsers
        .filter(user => routines.isValidDate(user[attr], utils.DATE_FORMAT))
        .map(user => {
          const thisYear = moment().year()
          const date = moment(user[attr], utils.DATE_FORMAT).year(thisYear)
          const sortedDate = date.unix() >= moment().unix()
            ? date.format(`DD.MM.${date.year() - 1}`) : date.format(`DD.MM.${date.year()}`)

          return {
            name: user.name,
            [attr]: user[attr],
            sortedDate: sortedDate
          }
        })
        .sort((a, b) => utils.sorting(a.sortedDate, b.sortedDate, 'DD.MM.YYYY'))
        .map(user => ` @${user.name} ${desc} ${moment(user[attr], utils.DATE_FORMAT).format(utils.OUTPUT_DATE_FORMAT)}`)

      if (!message.length) {
        msg.send('Oops... No results.')
        return
      }

      msg.send(`*${title} list*\n${message.join('\n')}`)
    })

    // Reset date of first working day.
    robot.respond(routes.fwd_set, async (msg) => {
      let date
      let name
      let user
      let users

      if (!await routines.isAdmin(robot, msg.message.user.name.toString())) {
        msg.send(utils.MSG_PERMISSION_DENIED)
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

      if (!routines.isValidDate(date, utils.DATE_FORMAT)) {
        msg.send(utils.MSG_INVALID_DATE)
        return
      }

      if (users.length === 1) {
        user = users[0]
        user.dateOfFwd = date

        return msg.send(`Saving ${name}'s first working day.`)
      } else if (users.length > 1) {
        return msg.send(utils.getAmbiguousUserText(users))
      } else {
        return msg.send(`I have never met ${name}.`)
      }
    })

    // Check regularly if today is someone's birthday, write birthday messages to the general channel.
    if (utils.HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(utils.HAPPY_REMINDER_SCHEDULER, () => utils.sendCongratulations(robot))
    }

    // test

    // Send reminders of the upcoming birthdays to the users (except ones whose birthday it is).

    if (utils.HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(utils.HAPPY_REMINDER_SCHEDULER, () => utils.sendReminders(robot, utils.NUMBER_OF_DAYS_IN_ADVANCE, 'days'))
    }

    if (utils.HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(utils.HAPPY_REMINDER_SCHEDULER, () => utils.sendReminders(robot, 1, 'day'))
    }

    if (utils.HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(utils.HAPPY_REMINDER_SCHEDULER, () => utils.removeExpiredBirthdayChannels(robot))
    }

    if (utils.HAPPY_REMINDER_SCHEDULER) {
      schedule.scheduleJob(utils.HAPPY_REMINDER_SCHEDULER, () => utils.detectBirthdaylessUsers(robot))
    }
  }
}).call(this)
