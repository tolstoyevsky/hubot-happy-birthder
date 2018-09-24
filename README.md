[![build](https://travis-ci.com/tolstoyevsky/hubot-happy-birthder.svg?branch=master)](https://travis-ci.org/tolstoyevsky/hubot-happy-birthder)

# hubot-happy-birthder

Hubot script for writing birthday messages to users. It uses [Tenor](https://tenor.com) GIFs to make the messages more lively.

<p align="center">
    <img src="example.png" width="600">
</p>

## Features

* Fetches a random GIF using the `thesimpsonsbirthday+futuramabirthday+rickandmortybirthday+tmntbirthday+harrypotterbirthday` search query before writing a birthday message to a birthday boy/girl. The query (called "search term" in the Tenor terminology) is configurable via the `TENOR_SEARCH_TERM`environment variable. See the set of images associated with the search term used by default [here](https://tenor.com/search/thesimpsonsbirthday-futuramabirthday-rickandmortybirthday-tmntbirthday-harrypotterbirthday).
* Writes birthday messages to `#general`.
* Reminds users of the upcoming birthdays. It's possible to specify how long before the event occurs the reminder should be triggered.
* Provides fault tolerance:
  * if Tenor is for some reason unavailable right now, the script will try to request it a number of times with delays;
  * if all the requests failed, users will receive their birthday messages anyway.
* Creates private channels in advance and invites all the users to the channels except the birthday boys/girls for the purpose of discussing the presents for them. Expired channels are automatically removed.

## Prerequisites

The bot has to have `view-full-other-user-info` permission.

## Installation

In hubot project repo, run:

`npm install git+https://github.com/tolstoyevsky/hubot-happy-birthder --save`

Then add **hubot-happy-birthder** to your `external-scripts.json`:

```json
[
  "hubot-happy-birthder"
]
```

## Configuration

The script can be configured via the following environment variables (called parameters).

| Parameter                           | Description | Default |
|-------------------------------------|-------------|---------|
| `TENOR_API_KEY`                     | Сlient key for privileged API access. This is the only **mandatory** parameter. | |
| `TENOR_IMG_LIMIT`                   | Fetches up to the specified number of result, but not more than **50**. | 50 |
| `TENOR_SEARCH_TERM`                 | Helps to find GIFs associated with the specified term. | See [Features](#features) |
| `ANNOUNCER_CRON_STRING`             | Allows specifying the frequency with which the script checks for nearest birthdays. The value of this parameter must follow the [Cron Format](https://github.com/node-schedule/node-schedule#cron-style-scheduling). | `0 0 7 * * *` |
| `BIRTHDAY_CRON_STRING`              | Allows specifying the frequency with which the script writes birthday messages to users. The value of this parameter must follow the [Cron Format](https://github.com/node-schedule/node-schedule#cron-style-scheduling). | `0 0 7 * * *` |
| `BIRTHDAY_ANNOUNCEMENT_BEFORE_CNT`  | Sets how long before the event occurs the reminder will be triggered. | 7 |
| `BIRTHDAY_ANNOUNCEMENT_BEFORE_MODE` | Unit of time. The possible values are (the corresponding shorthands are specified in the brackets): `years` (`y`), `quarters` (`Q`), `months` (`M`), `weeks` (`w`), `days` (`d`), `hours` (`h`), `minutes` (`m`), `seconds` (`s`), `milliseconds` (`ms`). | days |

## Example Interaction

```
some.user >> @hubot birthday set matt 15/02/1954
hubot >> Saving matt's birthday.
some.user >> @hubot birthday set homer 12/05/1956
hubot >> Saving homer's birthday.
some.user >> @hubot birthdays list
hubot >> homer was born on 12/05/1956
hubot >> matt was born on 15/02/1954
```

## Known issues

When specifying a birth date for a particular user, the script may complain that it has never met the user before. In this case just ask the user to interact with the bot.

## Authors

See [AUTHORS](AUTHORS.md).

## Licensing

hubot-happy-birthder is available under the [Apache License, Version 2.0](LICENSE).

