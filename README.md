# hubot-birthday

Hubot script for writing birthday messages to users. It uses [Tenor](https://tenor.com) GIFs to make the messages more lively.

## Configuration

The script can be configured via the following environment variables (called parameters).

| Parameter                           | Description |
|-------------------------------------|-------------|
| `TENOR_API_KEY`                     | Сlient key for privileged API access. This is the only **mandatory** parameter. |
| `TENOR_IMG_LIMIT`                   | Fetches up to the specified number of result, but not more than **50**. By default the value of the variable and the corresponding API parameter is **20**. |
| `TENOR_SEARCH_TERM`                 | Helps to find GIFs associated with the specified term. |
| `ANNOUNCER_CRON_STRING`             | Allows specifying the frequency with which the script checks for nearest birthdays. The value of this parameter must follow the [Cron Format](https://github.com/node-schedule/node-schedule#cron-style-scheduling). |
| `BIRTHDAY_CRON_STRING`              | Allows specifying the frequency with which the script writes birthday messages to users. The value of this parameter must follow the [Cron Format](https://github.com/node-schedule/node-schedule#cron-style-scheduling). |
| `BIRTHDAY_ANNOUNCEMENT_BEFORE_CNT`  | Sets how long before the event occurs the reminder will be triggered. |
| `BIRTHDAY_ANNOUNCEMENT_BEFORE_MODE` | Unit of time. The possible values are (the corresponding shorthands are specified in the brackets): `years` (`y`), `quarters` (`Q`), `months` (`M`), `weeks` (`w`), `days` (`d`), `hours` (`h`), `minutes` (`m`), `seconds` (`s`), `milliseconds` (`ms`). |

## Sample Interaction

```
user>> meeseeks list birthdays
bot>> USER_A родился 15/08/1991
USER_B родился 02/07/1992
USER_C родился 02/07/1992
user>> meeseeks birthday set test 02/07/1992
bot>> Сохраняю день рождения test: 02/07/1992
user>> meeseeks birthdays on 02/07/1992
bot>> 02/07/1992 день рождения у <@test>, <@test-2>.
```
