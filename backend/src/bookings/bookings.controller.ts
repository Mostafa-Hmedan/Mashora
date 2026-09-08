import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Roles(Role.USER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.userId, dto);
  }

  @Roles(Role.USER)
  @Get('me')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.listMine(user.userId);
  }

  @Roles(Role.DOCTOR)
  @Get('doctor/me')
  listForDoctor(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.listForDoctor(user.userId);
  }

  @Roles(Role.USER)
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.getOneForUser(user.userId, id);
  }

  @Roles(Role.USER)
  @Delete(':id')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.cancel(user.userId, id);
  }
}
