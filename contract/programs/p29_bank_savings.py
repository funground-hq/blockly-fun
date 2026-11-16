money = 100.0  # starting money
rate = 0.05  # 5 percent each year
year = 0

while money < 200:
    money = money + money * rate
    year = year + 1
    print("Year", year, ":", round(money, 2))

print("It took", year, "years to double!")
