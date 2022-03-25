import { faker } from '@faker-js/faker';
import { randHex, randUser, User } from '@ngneat/falso';

const PROBABILITY_DESCRIPTION = 25;
const PROBABILITY_CHECKED = 25;
const MAX_DAYS_AHEAD = 14;

export interface ITodo {
  name: string;
  description: string;
  moment: Date;
  priority: number;
  checked: boolean;  
}

export interface ITag {
  name: string;
  weight: number;
  color: string;
  background: string;
}

export interface IMeeting {
  venue: string;
  duration: number;
  user_limit: number;
}

// minimun and maximum are inclusive
export function getRandomInteger(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// helpers
function titleCase(string: string){
  return string[0].toUpperCase() + string.slice(1).toLowerCase();
}

export function percent({percentage}: {percentage: number}): boolean {
  return getRandomInteger(1, 100) <= percentage;
}

export function randomTodo(after: Date = new Date()): ITodo {
  const todo = {
    name: titleCase(`${faker.word.verb()} ${faker.word.adjective()} ${faker.word.noun()}`),
    description: percent({percentage: PROBABILITY_DESCRIPTION}) ? faker.lorem.lines(1): '',
    moment: faker.date.soon(MAX_DAYS_AHEAD, after.toISOString()),
    priority: getRandomInteger(1, 100),
    checked: percent({percentage: PROBABILITY_CHECKED}),
  }
  
  return todo;
}

// make sure the email is unique
export function randomUsers({length}: {length: number}): User[] {
  while (true) {
    const randomUsers = randUser({ length })
    const uniqueUsers = [...new Set(randomUsers.map((e) => e.email))]; // filter duplicates
    if (uniqueUsers.length === length) {
      return randomUsers;
    }
  }
}

// prefer adjectives
export function randomTag(): ITag {
  const tag: ITag = {
    name: percent({percentage: 75}) ? faker.word.adjective(): faker.word.noun(),
    weight: getRandomInteger(1, 10),
    color: randHex(),
    background: randHex(),
  }
  
  return tag;
}

// only the new properties
export function randomMeeting(): IMeeting {
  const meeting: IMeeting = {
    venue: `${titleCase(faker.word.noun())} ${faker.word.noun()}`,
    duration: getRandomInteger(30, 120),
    user_limit: getRandomInteger(5, 10),
  }

  return meeting;
}