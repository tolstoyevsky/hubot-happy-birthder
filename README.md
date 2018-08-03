# hubot-birthday

Hubot script for writing birthday messages to users. It uses [Tenor](https://tenor.com) GIFs to make the messages more lively.

## Prerequisites

The script requires [hubot-auth](https://github.com/hubot-scripts/hubot-auth).

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

