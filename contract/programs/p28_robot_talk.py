import time

print("Beep boop. I am RoboBuddy.")
time.sleep(1)
name = input("What is your name? ")
print("Nice to meet you,", name)
time.sleep(1)

mood = input("Are you happy? ")
if mood.lower() == "yes" or mood.lower() == "y":
    print("Great! Let's play.")
else:
    print("Oh no. Let me tell you a joke.")
    time.sleep(2)
    print("Why did the robot go on holiday? To recharge!")
