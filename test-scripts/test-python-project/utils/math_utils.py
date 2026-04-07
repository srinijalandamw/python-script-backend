def heavy_compute(n):
    total = 0

    for i in range(n):
        total += (i % 10) ** 1.5

    return total