import { prisma } from "../lib/prisma";

export class UserService {
  static async getAllUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        regionName: true,
        assignedDistrict: true,
        clearanceLevel: true,
        isActive: true,
        regionId: true,
        districtId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }).then((users) =>
      users.map((user) => ({
        ...user,
        region: user.regionName,
      })),
    );
  }
}
