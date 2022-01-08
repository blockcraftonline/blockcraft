const THREE = require('three');

module.exports = class Bot {
    constructor(player, world) {
        this.bot = player;
        this.world = world;

        this.type = "bot";
    }

    update() {
        let { bot, world } = this;
        let blockSize = world.blockSize;

        let dt = 0.05;

        let acc = new THREE.Vector3(0, -9.81 * blockSize, 0);
        let vel = new THREE.Vector3().copy(bot.vel);
        let pos = new THREE.Vector3(0, 0, 0).add(bot.pos);

        vel.add(acc.clone().multiplyScalar(dt));

        let newPos = pos.clone().add(vel.clone().multiplyScalar(dt));
        newPos.divideScalar(world.blockSize);

        if (this.collideVoxel(newPos.x, newPos.y - 1.6, newPos.z)) {
            vel.y = 0;
            bot.vel = vel;
        }

        pos.add(vel.clone().multiplyScalar(dt));

        bot.vel = vel;
        bot.pos = pos;

        bot.punching = true;
    }

    collideVoxel(x, y, z) {
        let { world } = this;
        let voxel = world.getVoxel(x, y, z)
        if (voxel > 1 && voxel != 255)
            return voxel;
    }
}