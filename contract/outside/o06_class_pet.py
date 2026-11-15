class Pet:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return self.name + " says hello"


def welcome(pet, times=1):
    for _ in range(times):
        print(pet.speak())


rex = Pet("Rex")
welcome(rex, times=2)
print(rex.name.upper())
