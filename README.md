# hubot-birthday

Hubot script for writing birthday messages to users. It uses [Tenor](https://tenor.com) GIFs to make the messages more lively.

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
