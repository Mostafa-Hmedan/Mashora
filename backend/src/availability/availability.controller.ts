import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateSlotDto } from './dto/create-slot.dto';

@Controller()
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Roles(Role.DOCTOR)
  @Post('availability')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSlotDto) {
    return this.availabilityService.createSlot(user.userId, dto);
  }

  @Roles(Role.DOCTOR)
  @Get('availability/me')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.availabilityService.listMySlots(user.userId);
  }

  @Roles(Role.DOCTOR)
  @Delete('availability/:id')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.availabilityService.cancelSlot(user.userId, id);
  }

  @Public()
  @Get('doctors/:doctorId/availability')
  listForDoctor(@Param('doctorId') doctorId: string) {
    return this.availabilityService.listOpenSlots(doctorId);
  }
}
