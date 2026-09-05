import type { FastifyInstance } from "fastify";
import { userController } from "./controller/user.controller.js";

const userRouter = (app: FastifyInstance) => {
    // Every user route requires a valid access token.
    app.addHook("preHandler", app.authenticate);

    // Profile management
    app.patch("/profile", userController.updateProfile.bind(userController));

    // Address management
    app.post("/addresses", userController.createAddress.bind(userController));
    app.patch("/addresses/:addressId", userController.updateAddress.bind(userController));
    app.delete("/addresses/:addressId", userController.deleteAddress.bind(userController));

    // Phone verification and updates
    app.post("/phone/request-otp", userController.requestPhoneOtp.bind(userController));
    app.put("/phone", userController.verifyPhone.bind(userController));
};

export default userRouter;