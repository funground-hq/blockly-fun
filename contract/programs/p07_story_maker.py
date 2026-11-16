import random

heroes = ["a dragon", "a robot", "a tiny mouse", "a pirate"]
places = ["in a cave", "on the moon", "in a school", "under the sea"]
actions = ["ate a pizza", "found some treasure", "learned to dance"]

hero = random.choice(heroes)
place = random.choice(places)
action = random.choice(actions)

print("Once upon a time there was " + hero + " " + place + ".")
print("One day it " + action + ".")
print("The end!")
