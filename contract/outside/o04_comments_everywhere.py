# Comments in places a block cannot hold them

score = 0
for turn in range(3):
    score += turn
    # still inside the loop, after its last line

# a note on its own, followed by a blank line

print(score)  # the end-of-line comment
if score > 2:
    print("big")
    # before the else, inside the if
else:
    print("small")
# the very last line
